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
    // 1. Check if the branch already exists
    const branchUrl = `${API_BASE}/branches/${branchName}`;
    const branchCheck = _request(branchUrl);

    if (!branchCheck) {
      // SCENARIO A: NEW BRANCH
      const mainBranch = _request(`${API_BASE}/branches/main`);
      _request(`${API_BASE}/git/refs`, {
        method: "post",
        payload: {
          ref: `refs/heads/${branchName}`,
          sha: mainBranch.commit.sha,
        },
      });
    }

    // 2. Fetch the latest file SHA from the SPECIFIC branch (not main!)
    // This is critical for Task 5.2 to avoid conflicts on the second commit
    const url = `${API_BASE}/contents/${path}?ref=${branchName}`;
    const currentFile = _request(url);

    // 3. Push the commit to the existing/new branch
    const commitResult = _request(`${API_BASE}/contents/${path}`, {
      method: "put",
      payload: {
        message: commitMessage,
        content: Utilities.base64Encode(Utilities.newBlob(content).getBytes()),
        sha: currentFile.sha,
        branch: branchName,
      },
    });

    if (!commitResult) throw new Error("GitHub rejected the commit.");

    // 4. Only create a PR if one doesn't already exist
    if (!branchCheck) {
      const pr = _request(`${API_BASE}/pulls`, {
        method: "post",
        payload: {
          title: `Docs Update: ${commitMessage}`,
          head: branchName,
          base: "main",
          body: "Automated update via @doc_bot.",
        },
      });
      return pr.html_url;
    }

    // If it was an existing branch, return the known PR link (stored in DB or constructed)
    return `https://github.com/${REPO}/pulls`;
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
