export type MemoDeliveryStatus = "not_requested" | "pending" | "sending" | "sent" | "failed";

export type WeComConfig = {
  corpId: string;
  agentId: string;
  secret: string;
  userId: string;
};

type DueMemo = {
  id: string;
  title: string;
  content: string;
  remind_at: string;
  attempt_count: number;
};

export async function ensureMemoSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS memos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      remind_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      wechat_enabled INTEGER NOT NULL DEFAULT 1,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_memos_due ON memos(delivery_status,status,remind_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_memos_user_time ON memos(user_id,remind_at)"),
  ]);
}

type WeComApiResult = { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
let accessTokenCache: { corpId: string; token: string; expiresAt: number } | null = null;

export function isWeComConfigured(config: WeComConfig | undefined): config is WeComConfig {
  return Boolean(config?.corpId && config.agentId && config.secret && config.userId && /^\d+$/.test(config.agentId));
}

async function getWeComAccessToken(config: WeComConfig) {
  if (accessTokenCache?.corpId === config.corpId && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", config.corpId);
  url.searchParams.set("corpsecret", config.secret);
  const response = await fetch(url);
  const result = await response.json().catch(() => ({})) as WeComApiResult;
  if (!response.ok || result.errcode !== 0 || !result.access_token) throw new Error(`wecom_token_${result.errcode ?? response.status}`);
  accessTokenCache = { corpId: config.corpId, token: result.access_token, expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 7200) - 300) * 1000 };
  return result.access_token;
}

export async function sendWeComMessage(config: WeComConfig | undefined, title: string, content: string) {
  if (!isWeComConfigured(config)) throw new Error("wecom_not_configured");
  const accessToken = await getWeComAccessToken(config);
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      touser: config.userId,
      msgtype: "text",
      agentid: Number(config.agentId),
      text: { content: `【wen flow 提醒】\n${title.slice(0, 120)}\n\n${content.slice(0, 1800)}` },
      safe: 0,
      enable_duplicate_check: 1,
      duplicate_check_interval: 1800,
    }),
  });
  const result = await response.json().catch(() => ({})) as WeComApiResult;
  if (!response.ok || result.errcode !== 0) {
    if ([40014, 42001, 42007, 42009].includes(Number(result.errcode))) accessTokenCache = null;
    throw new Error(`wecom_send_${result.errcode ?? response.status}`);
  }
}

export async function dispatchDueMemos(db: D1Database, config: WeComConfig | undefined, userId?: string, now = new Date()) {
  if (!isWeComConfigured(config)) return { sent: 0, failed: 0 };
  const due = userId
    ? await db.prepare("SELECT id,title,content,remind_at,attempt_count FROM memos WHERE user_id=? AND status='pending' AND wechat_enabled=1 AND delivery_status='pending' AND remind_at<=? AND attempt_count<3 ORDER BY remind_at LIMIT 20").bind(userId, now.toISOString()).all<DueMemo>()
    : await db.prepare("SELECT id,title,content,remind_at,attempt_count FROM memos WHERE status='pending' AND wechat_enabled=1 AND delivery_status='pending' AND remind_at<=? AND attempt_count<3 ORDER BY remind_at LIMIT 50").bind(now.toISOString()).all<DueMemo>();
  let sent = 0, failed = 0;
  for (const memo of due.results) {
    const claimed = await db.prepare("UPDATE memos SET delivery_status='sending',updated_at=? WHERE id=? AND delivery_status='pending'").bind(now.toISOString(), memo.id).run();
    if (!claimed.meta.changes) continue;
    try {
      const reminderTime = new Date(memo.remind_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
      await sendWeComMessage(config, memo.title, `${memo.content || "记得处理这件事。"}\n\n提醒时间：${reminderTime}`);
      await db.prepare("UPDATE memos SET delivery_status='sent',sent_at=?,last_error='',updated_at=? WHERE id=?").bind(now.toISOString(), now.toISOString(), memo.id).run();
      sent += 1;
    } catch (error) {
      const attempts = Number(memo.attempt_count || 0) + 1;
      await db.prepare("UPDATE memos SET delivery_status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?").bind(attempts >= 3 ? "failed" : "pending", attempts, error instanceof Error ? error.message.slice(0, 200) : "wecom_send_failed", now.toISOString(), memo.id).run();
      failed += 1;
    }
  }
  return { sent, failed };
}
