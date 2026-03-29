# Design Document: AI-Driven Documentation Assistant

## 1. Goal

To automate the maintenance of technical documentation within a GitHub repository based on discussions in a Telegram group. The system enables the creation of Pull Requests (PRs), previewing `diffs` directly in the chat, and applying iterative refinements before final approval.

## 2. Technology Stack (Zero-Cost / Serverless)

- **Runtime:** Google Apps Script (GAS) – Free Serverless environment.
- **AI Engine:** Gemini 2.5 Flash API (Free Tier).
- **Storage/State:** Google Sheets (as a lightweight DB) + GitHub REST API (Code storage).
- **Interface:** Telegram Bot API (Webhooks + Inline Buttons).

---

## 3. Data Architecture

### 3.1. Database Schema (Google Sheets)

To manage the state and concurrency of drafts, the following fields are used:

- `tg_msg_id`: ID of the Telegram message containing the action buttons (Primary Key for callback lookups).
- `branch_name`: The specific Git branch for the PR, utilizing `tg_msg_id` to prevent collisions (e.g., `docs-patch-<tg_msg_id>`).
- `file_path`: Fixed path to the single target file in the repository (MVP constraint).
- `draft_content`: The full generated Markdown content (hidden from the user, awaiting approval).
- `status`: `PENDING` (awaiting user approval), `PROCESSING` (AI is generating), `COMMITTED` (successfully pushed to Git).

---

## 4. Algorithms & Pseudocode

### 4.1. Incoming Webhook Handling (Telegram)

The orchestrator must distinguish between a new documentation request and a refinement of an existing draft.

```javascript
/** * Pseudocode for Webhook Entry Point
 */
function doPost(request) {
  const data = JSON.parse(request.postData.contents);

  // Case 1: Button Interaction (Approve/Cancel)
  if (data.callback_query) {
    handleApproval(data.callback_query);
    return;
  }

  // Case 2: Text Message
  const msg = data.message;
  if (isReplyToBot(msg)) {
    // Find existing PR context in Sheets via the replied-to message ID
    const context = db.findDraftByMsgId(msg.reply_to_message.id);
    processAIRequest(msg.text, context);
  } else if (msg.text.includes("@bot")) {
    // Initial request for new documentation
    processAIRequest(msg.text, null);
  }
}
```

### 4.2. Intelligence Layer (Gemini Interaction)

A system prompt forces the AI to return a structured JSON response for easy parsing.

**System Prompt Fragment:**

> "You are a Technical Writer. Analyze the user message and the current file content.
> Return ONLY a JSON object:
> {
> 'summary': 'Short description of changes',
> 'diff': 'The changes in `diff ... ` format',
> 'new_full_content': 'The entire updated file content'
> }"

### 4.3. Iterative Refinement Logic (Concurrency Control)

To ensure strict concurrency and prevent Google Sheet state collisions when multiple users trigger the bot simultaneously, GAS `LockService` must be used.

```javascript
function processAIRequest(userText, context) {
  // 1. Acquire GAS LockService lock to prevent race conditions
  //    Write lock to DB (status = PROCESSING) and release GAS lock
  // 2. Fetch current file content from GitHub
  //    (If context exists, fetch from the PR branch; otherwise, from 'main')
  const currentText = github.getFile(context ? context.branch : "main");

  // 3. Request generation from Gemini
  const aiResponse = gemini.generate(userText, currentText);

  // 4. Send the Diff preview to Telegram with action buttons
  const sentMsg = tg.sendMessage({
    text: `📝 **Proposed Changes:**\n${aiResponse.diff}`,
    buttons: ["✅ Approve", "🔄 Regenerate", "🗑 Cancel"],
  });

  // 5. Update/Save the draft in Sheets, mapping it to the new message ID
  db.saveDraft(sentMsg.id, aiResponse.new_full_content, branchName);
}
```

---

## 5. User Experience (UX Flow)

1.  **Initiation:** You type in the group: `@doc_bot Add an API description for payments using this message.`
2.  **Concurrency Check:** If someone else is actively editing the single target file, the bot immediately replies: `❌ File locked by User A.`
3.  **Draft Preview:** If clear, the bot replies:
    > **📝 Proposed Changes:**
    >
    > ```diff
    > + ## Payment API
    > + Use the `/v1/pay` endpoint to...
    > ```
    >
    > _Approve these changes?_
    > `[✅ Approve]` `[🗑 Cancel]`
4.  **Refinement:** You notice a mistake. You **Reply** to the bot's preview message: `Add that the daily limit is 50k.`
5.  **Update:** The bot updates its message (or sends a new one) with an **updated diff** that incorporates both the original text and the new limit.
6.  **Commit & Handoff:** You click `✅ Approve`. The bot creates the branch `docs-patch-XXXX`, pushes the file, and opens a Draft PR assigned to the documentation maintainer. It also posts a link to the Pull Request, which includes a deep-link back to the original Telegram conversation.

---

## 6. Security & Constraints

- **SHA Validation:** Before committing, the script performs a `GET /contents` to retrieve the latest file `sha`. This prevents `409 Conflict` errors if the repository changed during the AI generation process.
- **Secure Credentials:** GitHub tokens and AI API keys are stored in `Script Properties` (environment variables) and are never hardcoded.
- **Access Control:** The bot is restricted to specific `group_id` values to prevent unauthorized usage and token consumption.

---

## 7. Future Roadmap

- **Multi-file changes:** Support modifying multiple documentation files (currently restricted to a single file MVP).
- **Auto-merge capability:** Automatically merge trivial formatting/typo fixes upon approval.
- Automated database cleanup when a PR is merged or closed on GitHub.
- Integration with GitHub Webhooks to notify the Telegram group of comments made directly on GitHub.
