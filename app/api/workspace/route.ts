import { NextResponse } from "next/server";
import { ensureSchema, getD1, getWorkspaceIdentity, seedWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

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
  const { db, identity } = context;

  const [profile, journeys, outcomes, actions, checkins, reviews] = await Promise.all([
    db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(identity.userId).first(),
    db.prepare("SELECT * FROM journeys WHERE user_id = ? AND deleted_at IS NULL ORDER BY sequence_number").bind(identity.userId).all(),
    db.prepare("SELECT * FROM monthly_outcomes WHERE user_id = ? ORDER BY rowid").bind(identity.userId).all(),
    db.prepare("SELECT * FROM weekly_actions WHERE user_id = ? ORDER BY priority").bind(identity.userId).all(),
    db.prepare("SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").bind(identity.userId).all(),
    db.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 8").bind(identity.userId).all(),
  ]);

  return NextResponse.json({
    profile,
    journeys: journeys.results,
    outcomes: outcomes.results,
    actions: actions.results,
    checkins: checkins.results,
    reviews: reviews.results,
  });
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity } = context;
  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (body.action === "initialize") {
    await db.prepare("UPDATE profiles SET initialized = 1, updated_at = ? WHERE user_id = ?")
      .bind(now, identity.userId).run();
  } else if (body.action === "toggle-action" && typeof body.id === "string") {
    const row = await db.prepare("SELECT status FROM weekly_actions WHERE id = ? AND user_id = ?")
      .bind(body.id, identity.userId).first<{ status: string }>();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const status = row.status === "completed" ? "pending" : "completed";
    await db.prepare("UPDATE weekly_actions SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?")
      .bind(status, status === "completed" ? now : null, body.id, identity.userId).run();
  } else if (body.action === "checkin" && (body.type === "exercise" || body.type === "english")) {
    const duration = Math.max(0, Math.min(600, Number(body.duration) || 0));
    const note = typeof body.note === "string" ? body.note.slice(0, 300) : "";
    await db.prepare(
      "INSERT INTO checkins (id, user_id, type, duration, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), identity.userId, body.type, duration, note, now).run();
  } else if (body.action === "journey-status" && typeof body.id === "string" && typeof body.status === "string") {
    const allowed = ["active", "paused", "planned", "completed"];
    if (!allowed.includes(body.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    if (body.status === "active") {
      const count = await db.prepare("SELECT COUNT(*) AS total FROM journeys WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL")
        .bind(identity.userId).first<{ total: number }>();
      if ((count?.total ?? 0) >= 5) return NextResponse.json({ error: "active_limit" }, { status: 409 });
    }
    await db.prepare("UPDATE journeys SET status = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(body.status, body.id, identity.userId).run();
  } else if (body.action === "update-journey" && typeof body.id === "string") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const area = typeof body.area === "string" ? body.area.trim().slice(0, 30) : "";
    const acceptance = typeof body.acceptanceCriteria === "string" ? body.acceptanceCriteria.trim().slice(0, 300) : "";
    const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim().slice(0, 160) : "";
    if (!title || !area || !acceptance || !nextAction) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    await db.prepare(
      `UPDATE journeys SET title = ?, area = ?, acceptance_criteria = ?, next_action = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(title, area, acceptance, nextAction, body.id, identity.userId).run();
  } else if (body.action === "delete-journey" && typeof body.id === "string") {
    await db.prepare("UPDATE journeys SET deleted_at = ?, status = 'paused' WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(now, body.id, identity.userId).run();
  } else if (body.action === "adjust-plan" && typeof body.mode === "string") {
    if (body.mode === "pause-lowest") {
      const target = await db.prepare(
        `SELECT id FROM weekly_actions
         WHERE user_id = ? AND status = 'pending' AND outcome_id NOT LIKE ?
         ORDER BY priority DESC LIMIT 1`,
      ).bind(identity.userId, "%exercise").first<{ id: string }>();
      if (!target) return NextResponse.json({ error: "nothing_to_adjust" }, { status: 409 });
      await db.prepare("UPDATE weekly_actions SET status = 'paused' WHERE id = ? AND user_id = ?")
        .bind(target.id, identity.userId).run();
    } else if (body.mode === "shrink-scope") {
      const target = await db.prepare(
        `SELECT id, estimated_minutes FROM weekly_actions
         WHERE user_id = ? AND status = 'pending' AND outcome_id NOT LIKE ? AND estimated_minutes > 30
         ORDER BY estimated_minutes DESC LIMIT 1`,
      ).bind(identity.userId, "%exercise").first<{ id: string; estimated_minutes: number }>();
      if (!target) return NextResponse.json({ error: "nothing_to_adjust" }, { status: 409 });
      await db.prepare("UPDATE weekly_actions SET estimated_minutes = ? WHERE id = ? AND user_id = ?")
        .bind(Math.max(30, target.estimated_minutes - 20), target.id, identity.userId).run();
    } else if (body.mode === "restore-paused") {
      await db.prepare("UPDATE weekly_actions SET status = 'pending' WHERE user_id = ? AND status = 'paused'")
        .bind(identity.userId).run();
    } else {
      return NextResponse.json({ error: "invalid_adjustment" }, { status: 400 });
    }
  } else if (body.action === "review") {
    const achievement = typeof body.achievement === "string" ? body.achievement.slice(0, 600) : "";
    const lowValue = typeof body.lowValue === "string" ? body.lowValue.slice(0, 600) : "";
    const nextPriority = typeof body.nextPriority === "string" ? body.nextPriority.slice(0, 600) : "";
    if (!achievement || !nextPriority) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    await db.prepare(
      "INSERT INTO reviews (id, user_id, period, achievement, low_value, next_priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), identity.userId, "week", achievement, lowValue, nextPriority, now).run();
  } else {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
