import { NoWidget } from "../components/widgets/NoWidget";
import { AbstractWidget } from "../components/widgets/AbstractWidget";
import { WidgetBuildContext, WidgetRegistry } from "./SemanticRegistry";
import { GEOSPARQL_PATTERN, OWL_TIME_PATTERN, SemanticPatternRegistry } from "./SemanticPatterns";
import { OwlTimeWidget } from "./time/OwlTimeWidget";
import { GeoSparqlWidget } from "./geo/GeoSparqlWidget";

const WIDGETS: { [widget: string]: (ctx: WidgetBuildContext) => AbstractWidget } = {
  [OWL_TIME_PATTERN.widget]: (ctx) =>
    new OwlTimeWidget(ctx.parentComponent, ctx.startClassVal, ctx.objectPropVal, ctx.endClassVal),
  [GEOSPARQL_PATTERN.widget]: (ctx) =>
    new GeoSparqlWidget(
      ctx.settings?.customization?.map ?? {},
      ctx.parentComponent,
      ctx.startClassVal,
      ctx.objectPropVal,
      ctx.endClassVal,
    ),
};

/**
 * Registers the UI of each semantic widget. Called by the WidgetFactory module.
 * A function rather than a side-effect import, which bundlers drop since the package
 * declares no side effects.
 */
export function registerSemanticWidgets() {
  SemanticPatternRegistry.patterns.forEach((pattern) => {
    WidgetRegistry.registerWidget(
      pattern.widget,
      WIDGETS[pattern.widget] ?? ((ctx) => new NoWidget(ctx.parentComponent)),
    );
  });
}
