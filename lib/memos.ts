export type MemoDeliveryStatus = "not_requested" | "pending" | "sending" | "sent" | "failed";

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

export async function sendServerChanMessage(sendKey: string, title: string, content: string) {
  if (!sendKey) throw new Error("wechat_not_configured");
  const body = new URLSearchParams({ title: title.slice(0, 100), desp: content.slice(0, 8000) });
  const response = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(sendKey)}.send`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  const result = await response.json().catch(() => ({})) as { code?: number; message?: string };
  if (!response.ok || result.code !== 0) throw new Error(result.message?.slice(0, 160) || `wechat_http_${response.status}`);
}

export async function dispatchDueMemos(db: D1Database, sendKey: string | undefined, userId?: string, now = new Date()) {
  if (!sendKey) return { sent: 0, failed: 0 };
  const due = userId
    ? await db.prepare("SELECT id,title,content,remind_at,attempt_count FROM memos WHERE user_id=? AND status='pending' AND wechat_enabled=1 AND delivery_status='pending' AND remind_at<=? AND attempt_count<3 ORDER BY remind_at LIMIT 20").bind(userId, now.toISOString()).all<DueMemo>()
    : await db.prepare("SELECT id,title,content,remind_at,attempt_count FROM memos WHERE status='pending' AND wechat_enabled=1 AND delivery_status='pending' AND remind_at<=? AND attempt_count<3 ORDER BY remind_at LIMIT 50").bind(now.toISOString()).all<DueMemo>();
  let sent = 0, failed = 0;
  for (const memo of due.results) {
    const claimed = await db.prepare("UPDATE memos SET delivery_status='sending',updated_at=? WHERE id=? AND delivery_status='pending'").bind(now.toISOString(), memo.id).run();
    if (!claimed.meta.changes) continue;
    try {
      const reminderTime = new Date(memo.remind_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
      await sendServerChanMessage(sendKey, `wen flow 提醒：${memo.title}`, `${memo.content || "记得处理这件事。"}\n\n提醒时间：${reminderTime}`);
      await db.prepare("UPDATE memos SET delivery_status='sent',sent_at=?,last_error='',updated_at=? WHERE id=?").bind(now.toISOString(), now.toISOString(), memo.id).run();
      sent += 1;
    } catch (error) {
      const attempts = Number(memo.attempt_count || 0) + 1;
      await db.prepare("UPDATE memos SET delivery_status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?").bind(attempts >= 3 ? "failed" : "pending", attempts, error instanceof Error ? error.message.slice(0, 200) : "wechat_send_failed", now.toISOString(), memo.id).run();
      failed += 1;
    }
  }
  return { sent, failed };
}
