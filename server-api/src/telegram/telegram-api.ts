import { TelegramConfig } from './telegram.config';

/** A failed Telegram call. Never carries the bot token (it is part of the URL). */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Seconds Telegram asked us to wait (429). */
    readonly retryAfter: number | null,
    /** Retrying cannot help: bad request, bot blocked, chat gone. */
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The only place that talks to the Telegram Bot API. */
export class TelegramApi {
  constructor(
    private readonly cfg: Pick<TelegramConfig, 'token' | 'apiUrl'>,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async call<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.cfg.apiUrl}/bot${this.cfg.token}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (e) {
      // Network error or timeout: transient. The message never includes the URL.
      throw new TelegramApiError(
        `${method}: ${
          e?.name === 'TimeoutError' ? 'timed out' : 'network error'
        }`,
        null,
        null,
        false,
      );
    }
    let payload: {
      ok?: boolean;
      result?: T;
      description?: string;
      parameters?: { retry_after?: number };
    } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON answer */
    }
    if (res.ok && payload.ok) return payload.result as T;
    const retryAfter = payload.parameters?.retry_after ?? null;
    const permanent =
      res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new TelegramApiError(
      `${method}: HTTP ${res.status}${
        payload.description
          ? ` ${String(payload.description).slice(0, 200)}`
          : ''
      }`,
      res.status,
      retryAfter,
      permanent,
    );
  }

  sendMessage(chatId: string, text: string) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    });
  }

  getUpdates(offset: number, timeoutS: number) {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutS, allowed_updates: ['message'] },
      (timeoutS + 10) * 1000,
    );
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; is_bot?: boolean };
  };
}
