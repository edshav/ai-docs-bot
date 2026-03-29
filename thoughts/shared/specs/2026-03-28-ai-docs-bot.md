# AI-Driven Documentation Assistant Specification

## Executive Summary

A serverless Telegram bot that automates the maintenance of technical documentation by translating group chat discussions into GitHub Pull Requests, eliminating manual copying and pasting. It focuses on a streamlined, iterative workflow directly within Telegram.

## Problem Statement

Currently, technical decisions and API discussions in Telegram are manually transcribed into GitHub documentation by a designated team member. This process introduces friction, relies on manual effort, and creates a risk of knowledge loss if discussions are overlooked.

## Success Criteria

- The time spent by the designated person manually creating documentation updates from Telegram chats is drastically reduced.
- The system reliably creates GitHub Draft PRs with accurate markdown formatting.
- Draft PRs correctly link to the original contextual Telegram discussions.

## User Personas

- **Documentation Contributor:** Any technical or non-technical member of the permitted Telegram group who wants to update the docs based on a discussion (initiates the request).
- **Documentation Reviewer/Maintainer:** The specific person currently tasked with the manual chore, who will now only need to review and approve the bot's Draft PRs.

## User Journey

1. A user mentions `@doc_bot` in the permitted Telegram group, asking it to document a specific discussion or API change.
2. The bot acquires a state lock. If successful, it fetches the content of the single, predefined documentation file from GitHub.
3. The bot passes the user's intent and current file content to Gemini 2.5 Flash.
4. The bot replies in the group with a proposed Markdown `diff` and inline buttons: `[✅ Approve]`, `[🔄 Regenerate]`, `[🗑 Cancel]`.
5. If the user replies to the bot's message with refinements, the bot **dynamically updates (morphs) the existing diff message** in place to prevent chat spam.
6. The user clicks `✅ Approve`.
7. The bot dynamically edits the message to show a loading state while resolving the callback query.
8. The bot commits the file update (with proper Base64 payloads), opens a Draft PR on GitHub, and edits the Telegram message one final time with a link to the PR.
9. **Iterative PR Updates:** If the user replies with refinements *after* approval, the bot generates a new diff. Re-approving pushes an additional commit seamlessly to the existing open PR.

## Functional Requirements

### Must Have (P0)

- Single pre-defined Markdown file target in the GitHub repository.
- A Telegram bot integration that listens to mentions and replies.
- Integration with Gemini 2.5 Flash API to generate Markdown diffs from natural language prompts.
- A Google Sheets backend to statefully store the `draft_content`, `status`, and Telegram `message_id`.
- Concurrency protection: Wait up to 10 seconds to acquire a GAS `LockService` lock. State must be forcefully saved via `SpreadsheetApp.flush()` before releasing the lock.
- Self-Healing Mechanics: Implement an automated `clearLock()` mechanic to forcefully recover from accidental deadlocks if external APIs fail mid-execution, backed by a 30-minute Time-Driven Trigger (`runScheduledMaintenance`) to routinely sweep and gracefully expire abandoned locks.
- Actionable error bubbling: Expose GitHub or Gemini errors to the Telegram chat. Provide manual invocation functions (e.g., `manualAuthTest()`) to simplify testing without WebHook obfuscation.
- Iterative PR Updates: Allow pushing subsequent commits to an already opened PR if a user decides to refine a `COMMITTED` bot message.
- Auto-assign the PR to the documentation maintainer.
- PR descriptions must include a deep-link back to the original Telegram message.

### Should Have (P1)

- Graceful handling of Telegram's short webhook timeout window (e.g., sending an immediate acknowledgment message before calling Gemini).

### Nice to Have (P2)

- Multi-file documentation support (Future roadmap).
- Auto-merge capability for trivial formatting/typo fixes (Future roadmap).

## Technical Architecture

### Data Model

Google Sheets utilized as a transient state store with the following schema:

- `tg_msg_id` (Primary Key): ID of the Telegram message holding the action buttons.
- `branch_name`: Name of the auto-generated Git branch, utilizing `tg_msg_id` to prevent collisions (e.g., `docs-patch-<tg_msg_id>`).
- `file_path`: Fixed path to the target repository file.
- `draft_content`: The full AI-generated Markdown string (hidden from user, awaiting approval).
- `status`: State machine enum: `PENDING`, `PROCESSING`, `COMMITTED`.

### System Components

- **Orchestrator (Standalone Google Apps Script):** Serverless webhook handler utilizing the **Revealing Module Pattern** (encapsulated Services via `const TelegramService = (function() { ... })();`) for clean architecture.
- **LLM Engine (Gemini 2.5 Flash):** Natural language processing, structure enforcement, and diff generation.

### Integrations

- **Telegram Bot API:** Webhook ingestion, inline keyboards, message editing.
- **GitHub REST API:** Fetching file blobs (`GET /contents`), handling Base64 payloads natively, creating branches, committing files, opening Pull Requests.
- **Google Sheets API (via GAS `SpreadsheetApp`):** Key-value store for draft lifecycles, mapped as a relational database via `SpreadsheetApp.openById()`.

### Security Model

- **Access Control:** The bot only processes commands originating from a whitelisted `group_id`. _Anyone_ within that group can trigger the bot.
- **Authentication & Configuration:** Secrets and configurations (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `PERMITTED_GROUP_ID`, `GITHUB_REPO`, `TARGET_FILE_PATH`, `DATABASE_SHEET_ID`) are securely stored in GAS Script Properties, and never hardcoded.
- **Race Condition Prevention:** Google Apps Script `LockService` implemented to ensure atomic database read/writes on Google Sheets during bot invocation, preventing state corruption.

## Non-Functional Requirements

- **Reliability:** GitHub `sha` validation is strictly performed by fetching the latest SHA from the *target branch* immediately before committing. This allows multiple consecutive commits to the same PR without `409 Conflict` errors.
- **Cost:** Strictly $0 overhead by combining GAS, Google Sheets, free-tier Gemini API, and Telegram.

## Out of Scope

- Support for modifying multiple files in a single invocation.
- Automatic database cleanups when PRs are manually closed/merged in GitHub (requires GitHub Webhook integration, relegated to future).
- Auto-merging of Pull Requests.

## Open Questions for Implementation

- Will the maintainer be pinged excessively by Draft PR assignments?
- Does the bot need to acknowledge a request _before_ the Gemini API call finishes to prevent Telegram's webhook retry mechanism from triggering duplicate requests?
