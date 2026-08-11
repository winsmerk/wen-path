import { NextResponse } from "next/server";
import { geocodePlace } from "@/lib/geocode";
import { ensureSchema, getD1, getWorkspaceIdentity } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await getWorkspaceIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getD1();
  await ensureSchema(db);
  const payload = await request.json() as { id?: string };
  const id = payload.id?.slice(0, 80) ?? "";
  const footprint = await db.prepare("SELECT id,name FROM footprints WHERE id=? AND user_id=? AND geometry_version < 2")
    .bind(id, identity.userId).first<{ id: string; name: string }>();
  if (!footprint) return NextResponse.json({ ok: true });
  const geography = await geocodePlace(footprint.name);
  if (!geography) return NextResponse.json({ error: "place_not_found" }, { status: 404 });
  await db.prepare("UPDATE footprints SET latitude=?,longitude=?,geometry_json=?,geometry_version=2,updated_at=? WHERE id=? AND user_id=?")
    .bind(geography.latitude, geography.longitude, geography.geometryJson, new Date().toISOString(), id, identity.userId).run();
  return NextResponse.json({ ok: true });
}
