import { GEOF } from "../SemanticVocabulary";

export interface GeoRelation {
  id: string;
  // the GeoSPARQL filter function, undefined for "withinDistance"
  function?: string;
}

/**
 * The relations offered by the GeoSPARQL widget: the Simple Features family of
 * GeoSPARQL 1.0/1.1, which every compliant triplestore implements, plus a distance.
 * "The value <relation> the reference geometry".
 */
export const GEO_RELATIONS: GeoRelation[] = [
  { id: "sfWithin", function: `${GEOF}sfWithin` },
  { id: "sfIntersects", function: `${GEOF}sfIntersects` },
  { id: "withinDistance" },
  { id: "sfContains", function: `${GEOF}sfContains` },
  { id: "sfDisjoint", function: `${GEOF}sfDisjoint` },
  { id: "sfTouches", function: `${GEOF}sfTouches` },
  { id: "sfOverlaps", function: `${GEOF}sfOverlaps` },
  { id: "sfCrosses", function: `${GEOF}sfCrosses` },
  { id: "sfEquals", function: `${GEOF}sfEquals` },
];

export function findGeoRelation(id: string): GeoRelation | undefined {
  return GEO_RELATIONS.find((r) => r.id === id);
}
