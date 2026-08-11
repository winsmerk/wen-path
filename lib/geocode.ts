export type PlaceGeometry = {
  latitude: number;
  longitude: number;
  geometryJson: string | null;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  geojson?: GeoJSON.GeoJsonObject;
};

export async function geocodePlace(name: string): Promise<PlaceGeometry | null> {
  const params = new URLSearchParams({
    q: name,
    format: "jsonv2",
    limit: "8",
    layer: "address",
    polygon_geojson: "1",
    polygon_threshold: "0.001",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
      Referer: "https://wenzi-lifeos.winsmerk.chatgpt.site/",
      "User-Agent": "wen-path-footprints/1.0 (personal travel map)",
    },
  });
  if (!response.ok) return null;
  const places = await response.json() as NominatimResult[];
  const place = places.find((candidate) => candidate.geojson?.type === "Polygon" || candidate.geojson?.type === "MultiPolygon") ?? places[0];
  const latitude = Number(place?.lat);
  const longitude = Number(place?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const serialized = place.geojson ? JSON.stringify(place.geojson) : null;
  return { latitude, longitude, geometryJson: serialized && serialized.length <= 1_500_000 ? serialized : null };
}
