/**
 * GeminiService: Interfaces with the Gemini 1.5 Flash API.
 */
const GeminiService = (function () {
  const scriptProps = PropertiesService.getScriptProperties();
  const API_KEY = scriptProps.getProperty("GEMINI_API_KEY");
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  /**
   * Generates a diff and updated content based on user intent and existing file.
   * Milestone 2 - Task 2.3
   */
  function generateDiff(userPrompt, currentContent) {
    const systemInstruction = `You are a Technical Writer. Analyze the user message and current file content.
      Return ONLY a JSON object with these keys:
      "summary": "Short description of changes",
      "diff": "The changes in diff format (using + and -)",
      "new_full_content": "The entire updated file content"`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Current File Content:\n${currentContent}\n\nUser Request: ${userPrompt}`,
            },
          ],
        },
      ],
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        response_mime_type: "application/json",
      },
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(API_URL, options);
    const result = JSON.parse(response.getContentText());

    if (result.candidates && result.candidates[0].content.parts[0].text) {
      // Parse the JSON string returned by the model
      return JSON.parse(result.candidates[0].content.parts[0].text);
    } else {
      console.error("Gemini Error: " + response.getContentText());
      throw new Error("Failed to generate documentation update.");
    }
  }

  return { generateDiff };
})();

function testGemini() {
  const result = GeminiService.generateDiff(
    "Add a section about ordering.",
    "# My API Docs",
  );
  console.log("Summary: " + result.summary);
  console.log("Diff:\n" + result.diff);
}
