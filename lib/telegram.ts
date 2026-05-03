const API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN!}`;

export type TelegramSendResult = { ok: boolean; error?: string };

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<TelegramSendResult> {
  if (!chatId) return { ok: false, error: 'no chat_id' };

  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, error: `telegram ${res.status}: ${errBody.slice(0, 200)}` };
  }
  return { ok: true };
}
