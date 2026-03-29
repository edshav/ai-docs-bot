/**
 * TelegramService: Handles all interactions with the Telegram Bot API.
 */
const TelegramService = (function () {
  const scriptProps = PropertiesService.getScriptProperties();
  const TOKEN = scriptProps.getProperty("TELEGRAM_BOT_TOKEN");
  const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

  /**
   * Sends a text message to a specific chat.
   * Supports MarkdownV2 and Inline Keyboards for Task 4.1.
   */
  function sendMessage(chatId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown", // Simplified Markdown for ease of use
      ...options,
    };

    return _request("sendMessage", payload);
  }

  /**
   * Edits an existing message (used for Task 4.2 refinement flow).
   */
  function editMessage(chatId, messageId, newText, options = {}) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "Markdown",
      ...options,
    };

    return _request("editMessageText", payload);
  }

  /**
   * Acknowledges callback queries to stop the "loading" spinner on buttons.
   */
  function answerCallback(callbackQueryId, text = "") {
    return _request("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: text,
    });
  }

  /**
   * Internal helper to handle the URL fetch.
   */
  function _request(method, payload) {
    const url = `${API_BASE}/${method}`;
    const params = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, params);
    const result = JSON.parse(response.getContentText());

    if (!result.ok) {
      console.error(`Telegram API Error (${method}): ${result.description}`);
    }
    return result;
  }

  // Public API
  return {
    sendMessage,
    editMessage,
    answerCallback,
  };
})();

function manualAuthTest() {
  const chatId =
    PropertiesService.getScriptProperties().getProperty("PERMITTED_GROUP_ID");
  TelegramService.sendMessage(chatId, "Authorization successful! ✅");
}
