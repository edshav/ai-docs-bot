interface DraftRecord {
  tg_msg_id: string | number;
  branch_name: string;
  file_path: string;
  draft_content: string;
  status: "PENDING" | "PROCESSING" | "COMMITTED" | "CANCELED" | "EXPIRED";
}

interface FetchOptions {
  method?: string;
  payload?: Record<string, unknown> | unknown[] | string;
  headers?: Record<string, string>;
}

type TelegramOptions = Record<string, unknown>;
