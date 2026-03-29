function doPost(e) {
  const scriptProps = PropertiesService.getScriptProperties();
  const PERMITTED_ID = scriptProps.getProperty("PERMITTED_GROUP_ID");
  const TARGET_FILE = scriptProps.getProperty("TARGET_FILE_PATH");
  const TELEGRAM_BOT_USERNAME = scriptProps.getProperty(
    "TELEGRAM_BOT_USERNAME",
  );

  try {
    const contents = JSON.parse(e.postData.contents);

    // 1. Identify if this is a button click (callback)
    if (contents.callback_query) {
      const callback = contents.callback_query;
      const data = callback.data; // e.g., "approve_12345"
      const chatId = callback.message.chat.id;
      const messageId = callback.message.message_id;

      // Acknowledge the click immediately (stops the loading spinner)
      TelegramService.answerCallback(callback.id, "Processing...");

      if (data.startsWith("approve_")) {
        handleApproval(chatId, messageId, data.split("_")[1]);
      } else if (data.startsWith("cancel_")) {
        handleCancellation(chatId, messageId, data.split("_")[1]);
      }
      return;
    }

    const message = contents.message;
    if (!message || !message.text) return;

    const chatId = String(message.chat.id);
    const text = message.text;
    const msgId = message.message_id;

    // 2. Security & Trigger Check
    if (chatId !== PERMITTED_ID) return;
    if (!text.includes(TELEGRAM_BOT_USERNAME)) return;
    // 3. Concurrency Check (Task 3.2 & 5.1)
    const activeLock = DatabaseService.getActiveLock();
    if (activeLock) {
      TelegramService.sendMessage(
        chatId,
        "⚠️ *File Locked:* Another update is currently in progress. Please wait for it to be committed or canceled.",
      );
      return;
    }

    // 4. Start Processing
    const statusMsg = TelegramService.sendMessage(
      chatId,
      "🔍 Reading documentation and thinking...",
      {
        reply_to_message_id: msgId,
      },
    );

    // 5. Fetch from GitHub (Task 2.2)
    const githubFile = GitHubService.getFile(TARGET_FILE);

    // 6. Generate AI Diff (Task 2.3)
    const aiResponse = GeminiService.generateDiff(text, githubFile.content);

    // 7. Save State to Database (Task 3.1)
    // We use the Telegram Status Message ID as our primary key for the buttons
    const draftData = {
      tg_msg_id: statusMsg.result.message_id,
      branch_name: `docs-patch-${statusMsg.result.message_id}`,
      file_path: TARGET_FILE,
      draft_content: aiResponse.new_full_content,
      status: "PENDING",
    };
    DatabaseService.saveDraft(draftData);

    // 8. Respond with Diff and Action Buttons
    const responseText =
      `📝 *Proposed Changes:*\n\n` +
      `*Summary:* ${aiResponse.summary}\n\n` +
      `\`\`\`diff\n${aiResponse.diff}\n\`\`\``;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ Approve",
            callback_data: `approve_${statusMsg.result.message_id}`,
          },
          {
            text: "🗑 Cancel",
            callback_data: `cancel_${statusMsg.result.message_id}`,
          },
        ],
      ],
    };

    TelegramService.editMessage(
      chatId,
      statusMsg.result.message_id,
      responseText,
      {
        reply_markup: JSON.stringify(keyboard),
      },
    );
  } catch (err) {
    console.error("Orchestration Error: " + err.toString());

    // NEW: Clean up the lock so the bot doesn't stay stuck
    DatabaseService.clearLock(TARGET_FILE);

    const debugId = scriptProps.getProperty("PERMITTED_GROUP_ID");
    TelegramService.sendMessage(
      debugId,
      "❌ *System Error:* " +
        err.message +
        "\n\n_The file lock has been released._",
    );
  }
}

function handleApproval(chatId, messageId, draftId) {
  try {
    const draft = DatabaseService.findDraftByMsgId(draftId);
    if (!draft || draft.status !== "PENDING") {
      TelegramService.editMessage(
        chatId,
        messageId,
        "❌ Error: Draft expired or already processed.",
      );
      return;
    }

    TelegramService.editMessage(
      chatId,
      messageId,
      "🚀 *Committing to GitHub...*",
    );

    // Task 2.2 Extension: Create the PR
    // (We will add these methods to GitHubService in the next step)
    const prUrl = GitHubService.createFullPR(
      draft.branch_name,
      draft.file_path,
      draft.draft_content,
      "Update documentation via Telegram Bot",
    );

    // Update Database (Task 3.1)
    draft.status = "COMMITTED";
    DatabaseService.saveDraft(draft);

    // Final Success Message (Task 4.3)
    const successText = `✅ *Success!* Documentation updated.\n\n[View Pull Request on GitHub](${prUrl})`;
    TelegramService.editMessage(chatId, messageId, successText);
  } catch (err) {
    TelegramService.sendMessage(chatId, "❌ *Commit Failed:* " + err.message);
  }
}

function handleCancellation(chatId, messageId, draftId) {
  const draft = DatabaseService.findDraftByMsgId(draftId);
  if (draft) {
    draft.status = "CANCELED";
    DatabaseService.saveDraft(draft);
  }
  TelegramService.editMessage(
    chatId,
    messageId,
    "🗑 *Update Canceled.* The file lock has been released.",
  );
}
