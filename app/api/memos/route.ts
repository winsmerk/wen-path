import { NextResponse } from "next/server";
import { dispatchDueMemos, isWeComConfigured, sendWeComMessage } from "@/lib/memos";
import { ensureSchema, getD1, getWeComConfig, getWorkspaceIdentity, seedWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function clean(value: unknown, length = 1200) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

async function prepare() {
  const identity = await getWorkspaceIdentity();
  if (!identity) return null;
  const db = getD1();
  await ensureSchema(db);
  await seedWorkspace(db, identity);
  return { db, identity };
}

export async function GET() {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wecomConfig = getWeComConfig();
  await dispatchDueMemos(context.db, wecomConfig, context.identity.userId);
  const rows = await context.db.prepare("SELECT * FROM memos WHERE user_id=? ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,remind_at ASC,updated_at DESC LIMIT 500").bind(context.identity.userId).all();
  return NextResponse.json({ memos: rows.results, wecomConfigured: isWeComConfigured(wecomConfig) });
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const action = clean(body.action, 30), now = new Date().toISOString();

  if (action === "save") {
    const id = clean(body.id, 100), title = clean(body.title, 120), content = clean(body.content, 4000), remindAtInput = clean(body.remindAt, 40), wecomEnabled = body.wecomEnabled !== false ? 1 : 0;
    const parsed = new Date(remindAtInput);
    if (!title || !Number.isFinite(parsed.getTime())) return NextResponse.json({ error: "invalid_memo" }, { status: 400 });
    const remindAt = parsed.toISOString(), deliveryStatus = wecomEnabled ? "pending" : "not_requested";
    if (id) {
      const result = await context.db.prepare("UPDATE memos SET title=?,content=?,remind_at=?,wechat_enabled=?,delivery_status=?,attempt_count=0,sent_at=NULL,last_error='',updated_at=? WHERE id=? AND user_id=?").bind(title, content, remindAt, wecomEnabled, deliveryStatus, now, id, context.identity.userId).run();
      if (!result.meta.changes) return NextResponse.json({ error: "not_found" }, { status: 404 });
    } else {
      await context.db.prepare("INSERT INTO memos (id,user_id,title,content,remind_at,status,wechat_enabled,delivery_status,attempt_count,sent_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,0,NULL,'',?,?)").bind(crypto.randomUUID(), context.identity.userId, title, content, remindAt, wecomEnabled, deliveryStatus, now, now).run();
    }
  } else if (action === "toggle") {
    const id = clean(body.id, 100);
    const row = await context.db.prepare("SELECT status FROM memos WHERE id=? AND user_id=?").bind(id, context.identity.userId).first<{ status: string }>();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await context.db.prepare("UPDATE memos SET status=?,updated_at=? WHERE id=? AND user_id=?").bind(row.status === "completed" ? "pending" : "completed", now, id, context.identity.userId).run();
  } else if (action === "delete") {
    const id = clean(body.id, 100);
    await context.db.prepare("DELETE FROM memos WHERE id=? AND user_id=?").bind(id, context.identity.userId).run();
  } else if (action === "test-wecom") {
    const wecomConfig = getWeComConfig();
    if (!isWeComConfigured(wecomConfig)) return NextResponse.json({ error: "wecom_not_configured" }, { status: 503 });
    try {
      await sendWeComMessage(wecomConfig, "企业微信提醒测试", "连接成功。之后备忘录到达设定时间时，会由 wen flow 自建应用直接发送消息。");
    } catch {
      return NextResponse.json({ error: "wecom_send_failed" }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
