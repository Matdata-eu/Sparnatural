import { Config } from "../ontologies/SparnaturalConfig";
import { GSP, QUDT, TIME } from "./SemanticVocabulary";

/**
 * A semantic pattern describes an intermediate node (a time:Instant, a gsp:Geometry,
 * a qudt:QuantityValue...) that a property shape can point to with sh:class, and that
 * a dedicated widget knows how to traverse to reach the literal value.
 *
 * When a property shape has sh:class on one of the pattern classes, and no NodeShape
 * targets that class, the range of the property becomes the special entity of the
 * pattern and the widget of the pattern is used.
 */
export interface SemanticPattern {
  // IRI of the special entity used as the range of the property
  specialEntity: string;
  label: string;
  icon: string;
  // widget used when the property shape has no dash:searchWidget
  widget: string;
  // classes that trigger this pattern, with the SPARQL property path (full IRIs) from
  // a node of that class to its literal value
  valuePaths: { [classIri: string]: string };
}

const TIME_INSTANT_VALUE =
  `<${TIME}inXSDDateTimeStamp>|<${TIME}inXSDDateTime>|<${TIME}inXSDDate>` +
  `|<${TIME}inXSDgYearMonth>|<${TIME}inXSDgYear>`;

// an Instant is its own beginning, an Interval goes through time:hasBeginning
const TIME_BEGIN_VALUE = `<${TIME}hasBeginning>?/(${TIME_INSTANT_VALUE})`;

const WKT = `<${GSP}asWKT>`;

const QUANTITY_VALUE = `<${QUDT}quantityValue>?/(<${QUDT}numericValue>|<${QUDT}value>)`;

export const OWL_TIME_PATTERN: SemanticPattern = {
  specialEntity: "http://special/Z_Time",
  label: "Time",
  icon: "fa-solid fa-clock",
  widget: Config.OWL_TIME_PROPERTY,
  valuePaths: {
    [`${TIME}TemporalEntity`]: TIME_BEGIN_VALUE,
    [`${TIME}Instant`]: TIME_BEGIN_VALUE,
    [`${TIME}Interval`]: TIME_BEGIN_VALUE,
    [`${TIME}ProperInterval`]: TIME_BEGIN_VALUE,
    [`${TIME}DateTimeInterval`]: TIME_BEGIN_VALUE,
  },
};

export const GEOSPARQL_PATTERN: SemanticPattern = {
  specialEntity: "http://special/Z_Geometry",
  label: "Geometry",
  icon: "fa-solid fa-draw-polygon",
  widget: Config.GEOSPARQL_PROPERTY,
  valuePaths: {
    [`${GSP}Geometry`]: WKT,
    [`${GSP}Feature`]: `(<${GSP}hasDefaultGeometry>|<${GSP}hasGeometry>)/${WKT}`,
  },
};

export const QUANTITY_PATTERN: SemanticPattern = {
  specialEntity: "http://special/Z_Quantity",
  label: "Quantity",
  icon: "fa-solid fa-scale-balanced",
  widget: Config.QUANTITY_PROPERTY,
  valuePaths: {
    [`${QUDT}QuantityValue`]: QUANTITY_VALUE,
    [`${QUDT}Quantity`]: QUANTITY_VALUE,
  },
};

export class SemanticPatternRegistry {
  static patterns: SemanticPattern[] = [
    OWL_TIME_PATTERN,
    GEOSPARQL_PATTERN,
    QUANTITY_PATTERN,
  ];

  /**
   * @returns the pattern triggered by one of the given sh:class values, or by the given
   * dash:searchWidget, or undefined
   */
  static find(classes: string[], searchWidget?: string): SemanticPattern | undefined {
    return SemanticPatternRegistry.patterns.find(
      (p) =>
        p.widget === searchWidget ||
        classes.some((c) => p.valuePaths[c] !== undefined),
    );
  }

  static findBySpecialEntity(uri: string): SemanticPattern | undefined {
    return SemanticPatternRegistry.patterns.find((p) => p.specialEntity === uri);
  }

  static findByWidget(uri: string): SemanticPattern | undefined {
    return SemanticPatternRegistry.patterns.find((p) => p.widget === uri);
  }

  /**
   * @returns the default value path of the pattern for the given sh:class values,
   * falling back on the first path of the pattern
   */
  static valuePath(pattern: SemanticPattern, classes: string[]): string {
    const c = classes.find((c) => pattern.valuePaths[c] !== undefined);
    return c ? pattern.valuePaths[c] : Object.values(pattern.valuePaths)[0];
  }
}
