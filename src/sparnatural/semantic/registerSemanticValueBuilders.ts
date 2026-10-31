import { WidgetRegistry } from "./SemanticRegistry";
import { SemanticPatternRegistry } from "./SemanticPatterns";
import { ValuePathValueBuilder } from "./SemanticValueBuilder";

/**
 * Registers how each semantic widget translates to SPARQL. Called by the SPARQL
 * translator modules, after ValueBuilder.ts is loaded. A function rather than a
 * side-effect import, which bundlers drop since the package declares no side effects.
 */
export function registerSemanticValueBuilders() {
  SemanticPatternRegistry.patterns.forEach((pattern) => {
    WidgetRegistry.registerValueBuilder(
      pattern.widget,
      () => new ValuePathValueBuilder(pattern),
    );
  });
}
