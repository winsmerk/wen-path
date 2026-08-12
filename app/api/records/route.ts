import { NextResponse } from "next/server";
import { ensureSchema, getD1, getMediaBucket, getWorkspaceIdentity } from "@/lib/workspace";

export const dynamic = "force-dynamic";

async function prepare() {
  const identity = await getWorkspaceIdentity();
  if (!identity) return null;
  const db = getD1();
  await ensureSchema(db);
  return { db, identity, media: getMediaBucket() };
}

function text(form: FormData, key: string, limit: number) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity, media } = context;
  const form = await request.formData();
  const recordType = text(form, "recordType", 20);
  const id = text(form, "id", 80);
  const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (!id || !["checkin", "task_output"].includes(recordType)) return NextResponse.json({ error: "invalid_record" }, { status: 400 });
  if (files.length > 6 || files.some((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) return NextResponse.json({ error: "invalid_images" }, { status: 400 });
  const imageCount = await db.prepare("SELECT COUNT(*) AS total FROM record_images WHERE user_id=? AND record_type=? AND record_id=?")
    .bind(identity.userId, recordType, id).first<{ total: number }>();
  if (Number(imageCount?.total ?? 0) + files.length > 6) return NextResponse.json({ error: "too_many_images" }, { status: 400 });
  if (files.length && !media) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });

  if (recordType === "checkin") {
    const existing = await db.prepare("SELECT id,type FROM checkins WHERE id=? AND user_id=?").bind(id, identity.userId).first<{ id: string; type: string }>();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const duration = Math.max(0, Math.min(600, Number(text(form, "duration", 10)) || 0));
    const note = text(form, "note", 5000);
    const recordedAt = text(form, "recordedAt", 10);
    if ((existing.type === "reading" || existing.type === "english") && !note) return NextResponse.json({ error: "note_required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    await db.prepare("UPDATE checkins SET duration=?,note=?,created_at=? WHERE id=? AND user_id=?")
      .bind(duration, note, `${recordedAt}T12:00:00.000Z`, id, identity.userId).run();
    await db.prepare("UPDATE evidence_events SET occurred_at=? WHERE user_id=? AND source_type='checkin' AND source_id=?")
      .bind(`${recordedAt}T12:00:00.000Z`, identity.userId, id).run();
  } else {
    const existing = await db.prepare("SELECT id,action_id,task_type FROM task_outputs WHERE id=? AND user_id=?").bind(id, identity.userId).first<{ id: string; action_id: string; task_type: string }>();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const title = text(form, "title", 180), content = text(form, "content", 5000), feeling = text(form, "feeling", 1000);
    const duration = Math.max(0, Math.min(600, Number(text(form, "duration", 10)) || 0));
    const recordedAt = text(form, "recordedAt", 10);
    if (!title || ((existing.task_type === "reading" || existing.task_type === "english" || existing.task_type === "account_operation") && !content) || (existing.task_type === "exercise" && (!duration || !feeling))) return NextResponse.json({ error: "output_required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    await db.prepare("UPDATE task_outputs SET title=?,content=?,duration=?,feeling=?,created_at=? WHERE id=? AND user_id=?")
      .bind(title, content, duration, feeling, `${recordedAt}T12:00:00.000Z`, id, identity.userId).run();
    await db.prepare("UPDATE evidence_events SET occurred_at=? WHERE user_id=? AND source_type='task_output' AND source_id=?")
      .bind(`${recordedAt}T12:00:00.000Z`, identity.userId, existing.action_id).run();
  }

  if (media && files.length) {
    const now = new Date().toISOString();
    const rows: D1PreparedStatement[] = [];
    for (const file of files) {
      const imageId = crypto.randomUUID();
      const objectKey = `${identity.userId}/records/${recordType}/${id}/${imageId}`;
      await media.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      rows.push(db.prepare("INSERT INTO record_images (id,record_type,record_id,user_id,object_key,content_type,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(imageId, recordType, id, identity.userId, objectKey, file.type, now));
    }
    if (rows.length) await db.batch(rows);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity, media } = context;
  const url = new URL(request.url), recordType = url.searchParams.get("recordType") ?? "", id = url.searchParams.get("id") ?? "";
  if (!id || !["checkin", "task_output"].includes(recordType)) return NextResponse.json({ error: "invalid_record" }, { status: 400 });
  let evidenceSourceId = id;
  if (recordType === "checkin") {
    const row = await db.prepare("SELECT id FROM checkins WHERE id=? AND user_id=?").bind(id, identity.userId).first();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  } else {
    const row = await db.prepare("SELECT action_id FROM task_outputs WHERE id=? AND user_id=?").bind(id, identity.userId).first<{ action_id: string }>();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    evidenceSourceId = row.action_id;
  }
  const images = await db.prepare("SELECT object_key FROM record_images WHERE user_id=? AND record_type=? AND record_id=?").bind(identity.userId, recordType, id).all<{ object_key: string }>();
  if (media) await Promise.all(images.results.map((image) => media.delete(image.object_key)));
  const table = recordType === "checkin" ? "checkins" : "task_outputs";
  await db.batch([
    db.prepare("DELETE FROM record_images WHERE user_id=? AND record_type=? AND record_id=?").bind(identity.userId, recordType, id),
    db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).bind(id, identity.userId),
    db.prepare("DELETE FROM evidence_events WHERE user_id=? AND source_type=? AND source_id=?").bind(identity.userId, recordType, evidenceSourceId),
  ]);
  return NextResponse.json({ ok: true });
}
