# Implementation Plan: AI-Driven Documentation Assistant

## Milestone 1: Environment Setup & Infrastructure
**Goal:** Set up Google Apps Script (GAS), Google Sheets, and the initial Telegram Webhook connection.
- [ ] **Task 1.1:** Create a new Google Sheet to serve as the Database. Define column headers: `tg_msg_id`, `branch_name`, `file_path`, `draft_content`, `status`.
- [ ] **Task 1.2:** Initialize a Google Apps Script project bound to the Google Sheet.
- [ ] **Task 1.3:** Setup Script Properties for Secrets: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `PERMITTED_GROUP_ID`, `GITHUB_REPO`, `TARGET_FILE_PATH`.
- [ ] **Task 1.4:** Implement the basic webhook entry point (`doPost`). Validate incoming requests ensure they originate from the `PERMITTED_GROUP_ID`.

## Milestone 2: Service API Integrations
**Goal:** Build individual service wrappers for external APIs to keep orchestration clean.
- [ ] **Task 2.1 - Telegram:** Implement `TelegramService` with methods for sending messages (with inline keyboards), editing messages, and acknowledging callback queries.
- [ ] **Task 2.2 - GitHub:** Implement `GitHubService` with methods for `getFileContent`, `createBranch`, `createCommit`, and `createPullRequest`.
- [ ] **Task 2.3 - Gemini:** Implement `GeminiService` with a strict `generateDiff(userPrompt, currentContent)` method mapped to the Gemini 1.5 Flash API, enforcing JSON markdown return formats.

## Milestone 3: Database & Concurrency
**Goal:** Handle thread-safety and DB persistence to prevent race conditions.
- [ ] **Task 3.1 - State Management:** Implement `DatabaseService` to execute lookups, insertions, and status updates on the Google Sheet.
- [ ] **Task 3.2 - Concurrency Protection:** Wrap reads and initial writes inside GAS `LockService` execution blocks to ensure that simultaneous requests do not corrupt the Google Sheet lock state. 

## Milestone 4: Orchestration & Business Logic
**Goal:** Tie the services together to match the User Journey UX.
- [ ] **Task 4.1 - Initiation Flow:** Detect `@doc_bot` mentions. Acquire Lock -> Verify no existing locks -> Lock active file (`status = PROCESSING`) -> Call GitHub -> Call Gemini -> Save state (`status = PENDING`) -> Generate `branch_name` using `tg_msg_id` -> Release Lock -> Respond via Telegram.
- [ ] **Task 4.2 - Refinement Flow:** Detect Telegram thread replies. Lookup draft -> Replicate generation loop -> Update the DB state -> Edit the existing Telegram diff message.
- [ ] **Task 4.3 - Approval Flow (Callback):** Handle `[✅ Approve]` button. Fetch `PENDING` draft -> Hit GitHub API (Branch => Commit => PR) -> Update state to `COMMITTED` -> Edit Telegram message with PR deep-link.
- [ ] **Task 4.4 - Cancellation Flow (Callback):** Handle `[🗑 Cancel]`. Update state to `CANCELED` -> Edit message to reflect aborted state.

## Milestone 5: Hardening & Error Handling
**Goal:** Ensure robustness and proper failure states.
- [ ] **Task 5.1:** Add a global `try/catch` wrapper in `doPost` to catch unhandled errors and format them as conversational Telegram messages instead of silent failures.
- [ ] **Task 5.2:** Add a secondary validation layer to the Approval Flow fetching the latest GitHub `sha` immediately before committing to guarantee no `409 Conflict` errors occur.
- [ ] **Task 5.3:** End-to-end live testing in the Telegram group chat.
