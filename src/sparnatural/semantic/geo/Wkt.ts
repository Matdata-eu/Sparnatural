/**
 * The few WKT shapes the GeoSPARQL widget draws and reads back: points, line strings
 * and polygons (outer ring only when drawing), in longitude-latitude order (CRS84).
 * Any other WKT is still accepted as text and sent to the triplestore as is.
 */
export type LonLat = [number, number];

export type SimpleGeometry =
  | { type: "Point"; coordinates: LonLat }
  | { type: "LineString"; coordinates: LonLat[] }
  | { type: "Polygon"; coordinates: LonLat[][] };

const NUMBER = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
const PAIR = `${NUMBER}\\s+${NUMBER}`;

function pairs(text: string): LonLat[] {
  return text
    .split(",")
    .map((p) => p.trim().split(/\s+/).map(Number))
    .map(([lon, lat]) => [lon, lat] as LonLat);
}

/**
 * @returns the geometry, or undefined when the WKT is not a POINT, LINESTRING or POLYGON
 * written in two dimensions with valid coordinates
 */
export function parseWkt(wkt: string): SimpleGeometry | undefined {
  const text = (wkt ?? "").trim();
  let m = new RegExp(`^POINT\\s*\\(\\s*(${PAIR})\\s*\\)$`, "i").exec(text);
  if (m) return valid({ type: "Point", coordinates: pairs(m[1])[0] });

  m = new RegExp(`^LINESTRING\\s*\\(\\s*(${PAIR}(?:\\s*,\\s*${PAIR})+)\\s*\\)$`, "i").exec(text);
  if (m) return valid({ type: "LineString", coordinates: pairs(m[1]) });

  m = new RegExp(`^POLYGON\\s*\\(\\s*((?:\\(\\s*${PAIR}(?:\\s*,\\s*${PAIR})+\\s*\\)\\s*,?\\s*)+)\\)$`, "i").exec(text);
  if (m) {
    const rings = m[1].match(/\(([^()]*)\)/g)!.map((r) => pairs(r.slice(1, -1)));
    if (rings.some((r) => r.length < 4 || !sameLonLat(r[0], r[r.length - 1]))) return undefined;
    return valid({ type: "Polygon", coordinates: rings });
  }
  return undefined;
}

function valid(g: SimpleGeometry): SimpleGeometry | undefined {
  const all: LonLat[] =
    g.type === "Point" ? [g.coordinates] : g.type === "LineString" ? g.coordinates : g.coordinates.flat();
  const ok = all.every(
    ([lon, lat]) => isFinite(lon) && isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90,
  );
  return ok ? g : undefined;
}

function sameLonLat(a: LonLat, b: LonLat) {
  return a[0] === b[0] && a[1] === b[1];
}

// 7 decimals is about 1 cm
const fmt = (n: number) => String(Math.round(n * 1e7) / 1e7);
const pair = ([lon, lat]: LonLat) => `${fmt(lon)} ${fmt(lat)}`;

export function toWkt(g: SimpleGeometry): string {
  switch (g.type) {
    case "Point":
      return `POINT(${pair(g.coordinates)})`;
    case "LineString":
      return `LINESTRING(${g.coordinates.map(pair).join(", ")})`;
    case "Polygon":
      return `POLYGON(${g.coordinates
        .map((ring) => {
          const closed = sameLonLat(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]];
          return `(${closed.map(pair).join(", ")})`;
        })
        .join(", ")})`;
  }
}

/**
 * @returns true when the text looks like WKT that a triplestore may understand, even if
 * the widget cannot draw it (MULTIPOLYGON, GEOMETRYCOLLECTION...)
 */
export function looksLikeWkt(wkt: string): boolean {
  return /^\s*(<[^>]+>\s*)?(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\b[^]*\)\s*$/i.test(
    wkt ?? "",
  );
}
