import { DataFactory } from "n3";
import { GEOF } from "../../sparnatural/semantic/SemanticVocabulary";
import { LonLat, parseWkt, SimpleGeometry } from "../../sparnatural/semantic/geo/Wkt";

/**
 * A small planar implementation of the GeoSPARQL functions used by the widget, plugged
 * into Comunica as extension functions, so that the generated queries can run on the
 * fixtures. Enough for points, line strings and simple polygons; distances are
 * haversine distances to a point reference.
 */
function read(term: any): SimpleGeometry {
  let text: string = term.value.trim();
  const epsg4326 = text.startsWith("<http://www.opengis.net/def/crs/EPSG/0/4326>");
  text = text.replace(/^<[^>]+>\s*/, "");
  const g = parseWkt(text);
  if (!g) throw new Error("Unsupported WKT in tests: " + term.value);
  if (!epsg4326) return g;
  // EPSG:4326 is latitude-longitude
  const swap = ([a, b]: LonLat): LonLat => [b, a];
  if (g.type === "Point") return { type: "Point", coordinates: swap(g.coordinates) };
  if (g.type === "LineString") return { type: "LineString", coordinates: g.coordinates.map(swap) };
  return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(swap)) };
}

const vertices = (g: SimpleGeometry): LonLat[] =>
  g.type === "Point" ? [g.coordinates] : g.type === "LineString" ? g.coordinates : g.coordinates[0];

const edges = (g: SimpleGeometry): [LonLat, LonLat][] => {
  if (g.type === "Point") return [];
  const pts = g.type === "LineString" ? g.coordinates : g.coordinates[0];
  return pts.slice(1).map((p, i) => [pts[i], p]);
};

function inPolygon([x, y]: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function properCross([a, b]: [LonLat, LonLat], [c, d]: [LonLat, LonLat]): boolean {
  const o = (p: LonLat, q: LonLat, r: LonLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

const edgesCross = (a: SimpleGeometry, b: SimpleGeometry) => edges(a).some((e) => edges(b).some((f) => properCross(e, f)));
function onEdge([x, y]: LonLat, [[ax, ay], [bx, by]]: [LonLat, LonLat]): boolean {
  const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  return Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

// inside or on the boundary
const insideOf = (p: LonLat, g: SimpleGeometry) =>
  g.type === "Polygon" && (inPolygon(p, g.coordinates[0]) || edges(g).some((e) => onEdge(p, e)));

function within(a: SimpleGeometry, b: SimpleGeometry): boolean {
  if (b.type !== "Polygon") return false;
  return vertices(a).every((p) => insideOf(p, b)) && !edgesCross(a, b);
}

function intersects(a: SimpleGeometry, b: SimpleGeometry): boolean {
  return vertices(a).some((p) => insideOf(p, b)) || vertices(b).some((p) => insideOf(p, a)) || edgesCross(a, b);
}

function haversine([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

// nearest point of a segment, in a local equirectangular projection
function nearest(p: LonLat, [a, b]: [LonLat, LonLat]): LonLat {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]];
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len));
  return [(ax + t * (bx - ax)) / k, ay + t * (by - ay)];
}

function distance(a: SimpleGeometry, b: SimpleGeometry): number {
  if (b.type !== "Point") throw new Error("Test distances need a point reference");
  const p = b.coordinates;
  if (insideOf(p, a)) return 0;
  const candidates = [...vertices(a), ...edges(a).map((e) => nearest(p, e))];
  return Math.min(...candidates.map((c) => haversine(c, p)));
}

const bool = (b: boolean) => DataFactory.literal(String(b), DataFactory.namedNode("http://www.w3.org/2001/XMLSchema#boolean"));

const relation = (test: (a: SimpleGeometry, b: SimpleGeometry) => boolean) => async (args: any[]) =>
  bool(test(read(args[0]), read(args[1])));

export const GEO_EXTENSION_FUNCTIONS: { [iri: string]: (args: any[]) => Promise<any> } = {
  [`${GEOF}sfWithin`]: relation(within),
  [`${GEOF}sfContains`]: relation((a, b) => within(b, a)),
  [`${GEOF}sfIntersects`]: relation(intersects),
  [`${GEOF}sfDisjoint`]: relation((a, b) => !intersects(a, b)),
  [`${GEOF}sfCrosses`]: relation((a, b) => a.type === "LineString" && intersects(a, b) && !within(a, b)),
  [`${GEOF}distance`]: async (args) =>
    DataFactory.literal(String(distance(read(args[0]), read(args[1]))), DataFactory.namedNode("http://www.w3.org/2001/XMLSchema#double")),
};
