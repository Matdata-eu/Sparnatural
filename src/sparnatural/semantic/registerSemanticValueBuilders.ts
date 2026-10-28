import { WidgetRegistry } from "./SemanticRegistry";
import { GEOSPARQL_PATTERN, OWL_TIME_PATTERN, QUANTITY_PATTERN, SemanticPatternRegistry } from "./SemanticPatterns";
import { SemanticValueBuilder, ValuePathValueBuilder } from "./SemanticValueBuilder";
import { OwlTimeValueBuilder } from "./time/OwlTimeValueBuilder";
import { GeoSparqlValueBuilder } from "./geo/GeoSparqlValueBuilder";
import { QuantityValueBuilder } from "./quantity/QuantityValueBuilder";

const BUILDERS: { [widget: string]: () => SemanticValueBuilder } = {
  [OWL_TIME_PATTERN.widget]: () => new OwlTimeValueBuilder(OWL_TIME_PATTERN),
  [GEOSPARQL_PATTERN.widget]: () => new GeoSparqlValueBuilder(GEOSPARQL_PATTERN),
  [QUANTITY_PATTERN.widget]: () => new QuantityValueBuilder(QUANTITY_PATTERN),
};

/**
 * Registers how each semantic widget translates to SPARQL. Called by the SPARQL
 * translator modules, after ValueBuilder.ts is loaded. A function rather than a
 * side-effect import, which bundlers drop since the package declares no side effects.
 */
export function registerSemanticValueBuilders() {
  SemanticPatternRegistry.patterns.forEach((pattern) => {
    WidgetRegistry.registerValueBuilder(
      pattern.widget,
      BUILDERS[pattern.widget] ?? (() => new ValuePathValueBuilder(pattern)),
    );
  });
}
