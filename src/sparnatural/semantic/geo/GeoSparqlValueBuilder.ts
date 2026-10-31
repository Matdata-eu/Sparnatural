import { GeoCriteria } from "../../SparnaturalQueryIfc";
import { SemanticValueBuilder } from "../SemanticValueBuilder";
import { SparqlFragment } from "../SparqlFragment";
import { GEOF, GSP, UOM } from "../SemanticVocabulary";
import { findGeoRelation } from "./GeoRelations";
import { looksLikeWkt } from "./Wkt";

/**
 * Translates the GeoSPARQL widget to standard GeoSPARQL: the value path reaches the
 * gsp:asWKT literal, which is bound to the object variable and compared with the
 * reference geometry with a geof:sf* function, or with geof:distance in metres.
 *
 *   ?s <property> ?X_node .
 *   ?X_node gsp:asWKT ?X .
 *   FILTER(geof:sfWithin(?X, "POLYGON((...))"^^gsp:wktLiteral))
 */
export class GeoSparqlValueBuilder extends SemanticValueBuilder {
  protected buildSparql(): string {
    const criterias = (this.values ?? []) as GeoCriteria[];
    if (criterias.length === 0) {
      if (!this.endClassVarSelected) return this.joinTriple;
      return `${this.joinTriple}
OPTIONAL { ${this.nodeVar} ${this.valuePath} ${this.valueVar} . }`;
    }
    const conditions = criterias
      .map((c) => this.#condition(c))
      .filter((c): c is string => c !== undefined);
    const filter = conditions.length === 0 ? "false" : conditions.map((c) => `(${c})`).join(" || ");
    return `${this.joinTriple}
${this.nodeVar} ${this.valuePath} ${this.valueVar} .
FILTER(${filter})`;
  }

  #condition(criteria: GeoCriteria): string | undefined {
    const relation = findGeoRelation(criteria.geoRelation);
    if (!relation || !looksLikeWkt(criteria.wkt)) {
      console.warn("Ignoring an invalid geo criteria", criteria);
      return undefined;
    }
    const reference = SparqlFragment.literal(criteria.wkt.trim(), `${GSP}wktLiteral`);
    if (relation.function) {
      return `<${relation.function}>(${this.valueVar}, ${reference})`;
    }
    if (!(criteria.distance >= 0)) {
      console.warn("Ignoring a distance criteria without a distance", criteria);
      return undefined;
    }
    return `<${GEOF}distance>(${this.valueVar}, ${reference}, <${UOM}metre>) <= ${SparqlFragment.decimal(criteria.distance)}`;
  }
}
