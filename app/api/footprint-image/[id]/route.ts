import { NextResponse } from "next/server";
import { ensureSchema, getD1, getMediaBucket, getWorkspaceIdentity } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getWorkspaceIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const media = getMediaBucket();
  if (!media) return NextResponse.json({ error: "media_unavailable" }, { status: 503 });
  const db = getD1();
  await ensureSchema(db);
  const { id } = await params;
  const image = await db.prepare("SELECT object_key,content_type FROM footprint_images WHERE id=? AND user_id=?")
    .bind(id, identity.userId).first<{ object_key: string; content_type: string }>();
  if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const object = await media.get(image.object_key);
  if (!object) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || image.content_type, "cache-control": "private, max-age=3600" } });
}
