import { WidgetRegistry } from "./SemanticRegistry";
import { SemanticPatternRegistry } from "./SemanticPatterns";
import { ValuePathValueBuilder } from "./SemanticValueBuilder";

/**
 * Registers how each semantic widget translates to SPARQL. Imported by the SPARQL
 * translators, after ValueBuilder.ts is loaded.
 */
SemanticPatternRegistry.patterns.forEach((pattern) => {
  WidgetRegistry.registerValueBuilder(
    pattern.widget,
    () => new ValuePathValueBuilder(pattern),
  );
});
