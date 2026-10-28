import { NoWidget } from "../components/widgets/NoWidget";
import { WidgetRegistry } from "./SemanticRegistry";
import { SemanticPatternRegistry } from "./SemanticPatterns";

/**
 * Registers the UI of each semantic widget. Imported by the WidgetFactory.
 */
SemanticPatternRegistry.patterns.forEach((pattern) => {
  WidgetRegistry.registerWidget(
    pattern.widget,
    (ctx) => new NoWidget(ctx.parentComponent),
  );
});
