import { NextResponse } from "next/server";
import { ensureSchema, getD1, getMediaBucket, getWorkspaceIdentity } from "@/lib/workspace";
import { geocodePlace } from "@/lib/geocode";

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
  const name = text(form, "name", 120);
  const status = text(form, "status", 20);
  const content = text(form, "content", 3000);
  const visitedAt = text(form, "visitedAt", 10) || null;
  const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (!name || !["visited", "wishlist"].includes(status)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (status === "visited" && !visitedAt) return NextResponse.json({ error: "date_required" }, { status: 400 });
  if (files.length > 6 || files.some((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) {
    return NextResponse.json({ error: "invalid_images" }, { status: 400 });
  }
  if (files.length && !media) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });

  const now = new Date().toISOString();
  const id = suppliedId || crypto.randomUUID();
  let geography: Awaited<ReturnType<typeof geocodePlace>> = null;
  if (suppliedId) {
    const existing = await db.prepare("SELECT id,name,latitude,longitude,geometry_json FROM footprints WHERE id=? AND user_id=?").bind(id, identity.userId).first<{ id: string; name: string; latitude: number | null; longitude: number | null; geometry_json: string | null }>();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    geography = existing.name === name && existing.latitude !== null && existing.longitude !== null
      ? { latitude: existing.latitude, longitude: existing.longitude, geometryJson: existing.geometry_json }
      : await geocodePlace(name);
    await db.prepare("UPDATE footprints SET name=?,status=?,content=?,visited_at=?,latitude=?,longitude=?,geometry_json=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(name, status, content, visitedAt, geography?.latitude ?? null, geography?.longitude ?? null, geography?.geometryJson ?? null, now, id, identity.userId).run();
  } else {
    geography = await geocodePlace(name);
    await db.prepare("INSERT INTO footprints (id,user_id,name,status,content,visited_at,latitude,longitude,geometry_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, identity.userId, name, status, content, visitedAt, geography?.latitude ?? null, geography?.longitude ?? null, geography?.geometryJson ?? null, now, now).run();
  }

  if (media && files.length) {
    const rows: D1PreparedStatement[] = [];
    for (const file of files) {
      const imageId = crypto.randomUUID();
      const objectKey = `${identity.userId}/footprints/${id}/${imageId}`;
      await media.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      rows.push(db.prepare("INSERT INTO footprint_images (id,footprint_id,user_id,object_key,content_type,created_at) VALUES (?,?,?,?,?,?)")
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
  const images = await db.prepare("SELECT object_key FROM footprint_images WHERE footprint_id=? AND user_id=?").bind(id, identity.userId).all<{ object_key: string }>();
  if (media) await Promise.all(images.results.map((image) => media.delete(image.object_key)));
  await db.batch([
    db.prepare("DELETE FROM footprint_images WHERE footprint_id=? AND user_id=?").bind(id, identity.userId),
    db.prepare("DELETE FROM footprints WHERE id=? AND user_id=?").bind(id, identity.userId),
  ]);
  return NextResponse.json({ ok: true });
}
