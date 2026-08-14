import { NextResponse } from "next/server";
import { ensurePlanningSchema, syncPlanningProgress } from "@/lib/planning";
import { ensureSchema, getD1, getMediaBucket, getWorkspaceIdentity } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function field(form: FormData, key: string, limit: number) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

async function prepare() {
  const identity = await getWorkspaceIdentity();
  if (!identity) return null;
  const db = getD1();
  await Promise.all([ensureSchema(db), ensurePlanningSchema(db)]);
  return { db, identity, media: getMediaBucket() };
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity, media } = context;
  const form = await request.formData();
  const id = field(form, "id", 100), instanceId = field(form, "instanceId", 100), typeKey = field(form, "typeKey", 40);
  const title = field(form, "title", 180), content = field(form, "content", 6000), feeling = field(form, "feeling", 1200);
  const recordedAt = field(form, "recordedAt", 10), duration = Math.max(0, Math.min(1440, Number(field(form, "duration", 10)) || 0));
  const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (!instanceId || !typeKey || !title || !content || !/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) return NextResponse.json({ error: "invalid_record" }, { status: 400 });
  if (files.length > 6 || files.some((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) return NextResponse.json({ error: "invalid_images" }, { status: 400 });
  if (files.length && !media) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });

  const instance = await db.prepare(`SELECT i.id,i.goal_id,i.status,COALESCE(d.record_required,0) AS record_required
    FROM task_instances_v2 i LEFT JOIN task_definitions_v2 d ON d.id=i.definition_id AND d.user_id=i.user_id
    WHERE i.id=? AND i.user_id=?`).bind(instanceId, identity.userId).first<{ id: string; goal_id: string; status: string; record_required: number }>();
  const type = await db.prepare("SELECT id FROM task_types_v2 WHERE user_id=? AND type_key=? AND enabled=1").bind(identity.userId, typeKey).first();
  if (!instance || !type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const existing = await db.prepare("SELECT id FROM planning_records_v2 WHERE user_id=? AND instance_id=?").bind(identity.userId, instanceId).first<{ id: string }>();
  if (id && existing?.id !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const recordId = existing?.id || crypto.randomUUID(), now = new Date().toISOString();
  const currentImages = await db.prepare("SELECT COUNT(*) AS total FROM record_images WHERE user_id=? AND record_type='planning_record' AND record_id=?")
    .bind(identity.userId, recordId).first<{ total: number }>();
  if (Number(currentImages?.total ?? 0) + files.length > 6) return NextResponse.json({ error: "too_many_images" }, { status: 400 });
  if (existing) {
    await db.prepare("UPDATE planning_records_v2 SET type_key=?,title=?,content=?,duration=?,feeling=?,recorded_at=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(typeKey, title, content, duration, feeling, recordedAt, now, recordId, identity.userId).run();
  } else {
    await db.prepare("INSERT INTO planning_records_v2 (id,user_id,instance_id,type_key,title,content,duration,feeling,recorded_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(recordId, identity.userId, instanceId, typeKey, title, content, duration, feeling, recordedAt, now, now).run();
  }

  if (media && files.length) {
    const rows: D1PreparedStatement[] = [];
    for (const file of files) {
      const imageId = crypto.randomUUID(), objectKey = `${identity.userId}/records/planning_record/${recordId}/${imageId}`;
      await media.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      rows.push(db.prepare("INSERT INTO record_images (id,record_type,record_id,user_id,object_key,content_type,created_at) VALUES (?,'planning_record',?,?,?,?,?)")
        .bind(imageId, recordId, identity.userId, objectKey, file.type, now));
    }
    if (rows.length) await db.batch(rows);
  }
  await db.prepare("UPDATE task_instances_v2 SET status='completed',completed_at=?,user_adjusted=1,updated_at=? WHERE id=? AND user_id=?")
    .bind(now, now, instanceId, identity.userId).run();
  await syncPlanningProgress(db, identity.userId, instance.goal_id, now);
  return NextResponse.json({ ok: true, id: recordId });
}

export async function DELETE(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity, media } = context;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const record = await db.prepare("SELECT id,instance_id FROM planning_records_v2 WHERE id=? AND user_id=?").bind(id, identity.userId).first<{ id: string; instance_id: string }>();
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const instance = await db.prepare("SELECT goal_id FROM task_instances_v2 WHERE id=? AND user_id=?").bind(record.instance_id, identity.userId).first<{ goal_id: string }>();
  const images = await db.prepare("SELECT object_key FROM record_images WHERE user_id=? AND record_type='planning_record' AND record_id=?").bind(identity.userId, id).all<{ object_key: string }>();
  if (media) await Promise.all(images.results.map((image) => media.delete(image.object_key)));
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM record_images WHERE user_id=? AND record_type='planning_record' AND record_id=?").bind(identity.userId, id),
    db.prepare("DELETE FROM planning_records_v2 WHERE id=? AND user_id=?").bind(id, identity.userId),
    db.prepare("UPDATE task_instances_v2 SET status='pending',completed_at=NULL,updated_at=? WHERE id=? AND user_id=?").bind(now, record.instance_id, identity.userId),
  ]);
  if (instance) await syncPlanningProgress(db, identity.userId, instance.goal_id, now);
  return NextResponse.json({ ok: true });
}
