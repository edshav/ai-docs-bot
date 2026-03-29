/**
 * GitHubService: Handles reading and writing to the GitHub repository.
 */
const GitHubService = (function () {
  const scriptProps = PropertiesService.getScriptProperties();
  const TOKEN = scriptProps.getProperty("GITHUB_TOKEN");
  const REPO = scriptProps.getProperty("GITHUB_REPO"); // Format: owner/repo
  const TELEGRAM_BOT_USERNAME = scriptProps.getProperty(
    "TELEGRAM_BOT_USERNAME",
  );
  const API_BASE = `https://api.github.com/repos/${REPO}`;

  /**
   * Fetches the content and SHA of a file from a specific branch.
   * Required for Task 4.1 (Initial fetch) and Task 5.2 (SHA validation).
   */
  function getFile(path, branch = "main") {
    const url = `${API_BASE}/contents/${path}?ref=${branch}`;
    const result = _request(url);

    if (!result) return null;

    // GitHub returns content in Base64 encoding
    const decodedContent = Utilities.newBlob(
      Utilities.base64Decode(result.content),
    ).getDataAsString();

    return {
      content: decodedContent,
      sha: result.sha,
    };
  }

  /**
   * Internal helper for GitHub API calls.
   */
  function _request(url, options = {}) {
    const params = {
      method: options.method || "get",
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      muteHttpExceptions: true,
    };

    if (options.payload) {
      params.contentType = "application/json";
      params.payload = JSON.stringify(options.payload);
    }

    const response = UrlFetchApp.fetch(url, params);
    const statusCode = response.getResponseCode();
    const resText = response.getContentText();

    if (statusCode >= 400) {
      console.error(`GitHub API Error (${statusCode}): ${resText}`);
      return null;
    }

    return JSON.parse(resText);
  }

  /**
   * Updated Task 4.3/5.2: Orchestration with SHA validation.
   */
  function createFullPR(branchName, path, content, commitMessage) {
    // 1. Get the current 'main' branch head to branch off from
    const mainBranch = _request(`${API_BASE}/branches/main`);
    if (!mainBranch) throw new Error("Could not find main branch.");
    const latestSha = mainBranch.commit.sha;

    // 2. Create the new branch
    _request(`${API_BASE}/git/refs`, {
      method: "post",
      payload: { ref: `refs/heads/${branchName}`, sha: latestSha },
    });

    // 3. FETCH THE LATEST FILE SHA (Task 5.2 - Critical Security)
    // We do this immediately before the 'put' to minimize the race condition window.
    const currentFile = getFile(path);
    if (!currentFile) throw new Error("File disappeared from GitHub!");

    // 4. Push the commit with the validated SHA
    const commitResult = _request(`${API_BASE}/contents/${path}`, {
      method: "put",
      payload: {
        message: commitMessage,
        content: Utilities.base64Encode(Utilities.newBlob(content).getBytes()),
        sha: currentFile.sha, // If this doesn't match the repo, GitHub returns 409
        branch: branchName,
      },
    });

    if (!commitResult)
      throw new Error("GitHub rejected the commit. Possible SHA mismatch.");

    // 5. Create PR
    const pr = _request(`${API_BASE}/pulls`, {
      method: "post",
      payload: {
        title: `Docs Update: ${commitMessage}`,
        head: branchName,
        base: "main",
        body: `Automated update via ${TELEGRAM_BOT_USERNAME}.`,
      },
    });

    return pr.html_url;
  }

  // Public API
  return {
    getFile,
    createFullPR,
  };
})();

function testGitHubRead() {
  const scriptProps = PropertiesService.getScriptProperties();
  const filePath = scriptProps.getProperty("TARGET_FILE_PATH");
  const repo = scriptProps.getProperty("GITHUB_REPO");

  console.log(`Checking repository: ${repo}`);
  console.log(`Targeting file: ${filePath}`);

  try {
    const fileData = GitHubService.getFile(filePath);

    if (fileData && fileData.content) {
      console.log("✅ Success! File content retrieved.");
      console.log("--- Content Preview ---");
      console.log(fileData.content.substring(0, 200) + "...");
      console.log("--- End Preview ---");
      console.log(`File SHA: ${fileData.sha}`);
    } else {
      console.error("❌ Failed: Could not find the file or content is empty.");
    }
  } catch (e) {
    console.error("❌ Error during GitHub read: " + e.toString());
  }
}
