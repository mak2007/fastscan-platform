/**
 * Telegram Bot API Client
 * Communicates with Telegram Bot API (https://api.telegram.org/bot<TOKEN>/...)
 * using native Node.js global fetch. Includes safe error handling, timeout,
 * and test simulation support.
 */

export class TelegramClient {
  constructor(token = null) {
    this.token = token || process.env.TELEGRAM_BOT_TOKEN || null;
    this.baseUrl = this.token ? `https://api.telegram.org/bot${this.token}` : null;
    this.isPolling = false;
    this.pollingOffset = 0;
    this.simulatedUpdatesHandler = null;
  }

  setToken(token) {
    this.token = token && token.trim() ? token.trim() : null;
    this.baseUrl = this.token ? `https://api.telegram.org/bot${this.token}` : null;
  }

  hasToken() {
    return Boolean(this.token && this.token.length > 10 && this.token.includes(':'));
  }

  /**
   * Verify token and get bot details from Telegram
   */
  async getMe() {
    if (!this.hasToken()) return null;
    try {
      const res = await fetch(`${this.baseUrl}/getMe`);
      const data = await res.json();
      return data && data.ok ? data.result : null;
    } catch (err) {
      console.error('[TelegramClient] getMe error:', err.message);
      return null;
    }
  }

  /**
   * Delete existing webhook to allow long polling
   */
  async deleteWebhook() {
    if (!this.hasToken()) return { ok: true };
    try {
      const res = await fetch(`${this.baseUrl}/deleteWebhook?drop_pending_updates=false`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[TelegramClient] deleteWebhook error:', err.message);
      return { ok: false };
    }
  }

  /**
   * Send a text message with optional reply_markup
   */
  async sendMessage(chatId, text, options = {}) {
    if (!this.hasToken()) {
      // In simulator / test mode, log and return simulated response
      return {
        ok: true,
        result: {
          message_id: Date.now(),
          chat: { id: chatId },
          date: Math.floor(Date.now() / 1000),
          text,
          ...options
        },
        simulated: true
      };
    }

    try {
      const payload = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        ...options
      };

      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[TelegramClient] sendMessage error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Send a photo (e.g. UPI QR code) with caption
   */
  async sendPhoto(chatId, photoUrl, caption = '', options = {}) {
    if (!this.hasToken()) {
      return {
        ok: true,
        result: {
          message_id: Date.now(),
          chat: { id: chatId },
          photo: [{ file_id: 'sim_photo' }],
          caption,
          ...options
        },
        simulated: true
      };
    }

    try {
      const payload = {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: options.parse_mode || 'HTML',
        ...options
      };

      const res = await fetch(`${this.baseUrl}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[TelegramClient] sendPhoto error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Answer callback query when inline keyboard button is clicked
   */
  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    if (!this.hasToken()) {
      return { ok: true, simulated: true };
    }

    try {
      const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert
        })
      });
      return await res.json();
    } catch (err) {
      console.error('[TelegramClient] answerCallbackQuery error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Edit existing message text and keyboard
   */
  async editMessageText(chatId, messageId, text, options = {}) {
    if (!this.hasToken()) {
      return { ok: true, simulated: true };
    }

    try {
      const payload = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        ...options
      };

      const res = await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      console.error('[TelegramClient] editMessageText error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Fetch updates via long polling
   */
  async getUpdates(offset = 0, timeout = 25) {
    if (!this.hasToken()) return { ok: true, result: [] };

    try {
      const res = await fetch(`${this.baseUrl}/getUpdates?offset=${offset}&timeout=${timeout}`);
      return await res.json();
    } catch (err) {
      console.error('[TelegramClient] getUpdates error:', err.message);
      return { ok: false, result: [] };
    }
  }

  /**
   * Start long polling loop
   */
  startPolling(onUpdate) {
    if (this.isPolling) return;
    this.isPolling = true;

    // Check bot identity on connect
    if (this.hasToken()) {
      this.getMe().then(bot => {
        if (bot) {
          console.log(`🤖 Telegram Bot connected successfully: @${bot.username} (${bot.first_name})`);
        }
      }).catch(err => {
        console.error('[TelegramClient] Could not verify bot token with Telegram:', err.message);
      });
    }

    const poll = async () => {
      if (!this.isPolling) return;

      if (this.hasToken()) {
        try {
          const res = await this.getUpdates(this.pollingOffset, 20);
          if (res && res.error_code === 409) {
            console.log('[TelegramClient] Webhook conflict detected (409). Clearing existing webhook...');
            await this.deleteWebhook();
          } else if (res && res.ok && Array.isArray(res.result)) {
            for (const update of res.result) {
              this.pollingOffset = update.update_id + 1;
              try {
                await onUpdate(update);
              } catch (e) {
                console.error('[TelegramClient] Error processing update:', e);
              }
            }
          }
        } catch (err) {
          console.error('[TelegramClient] Polling cycle error:', err.message);
        }
      }

      // Continue polling loop with small delay
      if (this.isPolling) {
        setTimeout(poll, this.hasToken() ? 1000 : 3000);
      }
    };

    poll();
  }

  stopPolling() {
    this.isPolling = false;
  }
}
