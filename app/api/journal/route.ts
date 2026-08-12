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
  const suppliedId = text(form, "id", 80);
  const type = text(form, "type", 20);
  const title = text(form, "title", 120);
  const content = text(form, "content", 10000);
  const recordedAt = text(form, "recordedAt", 10);
  const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (!["diary", "inspiration"].includes(type) || !title || !content || !/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (files.length > 6 || files.some((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) {
    return NextResponse.json({ error: "invalid_images" }, { status: 400 });
  }
  if (files.length && !media) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });

  const now = new Date().toISOString();
  const id = suppliedId || crypto.randomUUID();
  if (suppliedId) {
    const existing = await db.prepare("SELECT id FROM journal_entries WHERE id=? AND user_id=?").bind(id, identity.userId).first();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await db.prepare("UPDATE journal_entries SET type=?,title=?,content=?,recorded_at=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(type, title, content, recordedAt, now, id, identity.userId).run();
  } else {
    await db.prepare("INSERT INTO journal_entries (id,user_id,type,title,content,recorded_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, identity.userId, type, title, content, recordedAt, now, now).run();
  }

  if (media && files.length) {
    const rows: D1PreparedStatement[] = [];
    for (const file of files) {
      const imageId = crypto.randomUUID();
      const objectKey = `${identity.userId}/journal/${id}/${imageId}`;
      await media.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      rows.push(db.prepare("INSERT INTO journal_images (id,journal_id,user_id,object_key,content_type,created_at) VALUES (?,?,?,?,?,?)")
        .bind(imageId, id, identity.userId, objectKey, file.type, now));
    }
    if (rows.length) await db.batch(rows);
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity, media } = context;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const entry = await db.prepare("SELECT id FROM journal_entries WHERE id=? AND user_id=?").bind(id, identity.userId).first();
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const images = await db.prepare("SELECT object_key FROM journal_images WHERE journal_id=? AND user_id=?").bind(id, identity.userId).all<{ object_key: string }>();
  if (media) await Promise.all(images.results.map((image) => media.delete(image.object_key)));
  await db.batch([
    db.prepare("DELETE FROM journal_images WHERE journal_id=? AND user_id=?").bind(id, identity.userId),
    db.prepare("DELETE FROM journal_entries WHERE id=? AND user_id=?").bind(id, identity.userId),
  ]);
  return NextResponse.json({ ok: true });
}
