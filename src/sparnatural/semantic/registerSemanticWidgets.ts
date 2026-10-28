import { NoWidget } from "../components/widgets/NoWidget";
import { WidgetRegistry } from "./SemanticRegistry";
import { SemanticPatternRegistry } from "./SemanticPatterns";

/**
 * Registers the UI of each semantic widget. Called by the WidgetFactory module.
 * A function rather than a side-effect import, which bundlers drop since the package
 * declares no side effects.
 */
export function registerSemanticWidgets() {
  SemanticPatternRegistry.patterns.forEach((pattern) => {
    WidgetRegistry.registerWidget(
      pattern.widget,
      (ctx) => new NoWidget(ctx.parentComponent),
    );
  });
}
