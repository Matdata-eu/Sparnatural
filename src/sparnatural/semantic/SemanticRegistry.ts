import type ValueBuilderIfc from "../generators/sparql/ValueBuilder";
import type { AbstractWidget } from "../components/widgets/AbstractWidget";
import type { HTMLComponent } from "../components/HtmlComponent";
import type { SelectedVal } from "../components/SelectedVal";

/**
 * What a widget needs from the WidgetFactory to be built.
 */
export interface WidgetBuildContext {
  parentComponent: HTMLComponent;
  specProvider: any;
  settings: any;
  startClassVal: SelectedVal;
  objectPropVal: SelectedVal;
  endClassVal: SelectedVal;
  // runs a SPARQL query against the configured endpoints
  sparqlHandlerFactory: any;
  // adds prefixes and expands the SHACL shapes IRIs in a SPARQL query
  sparqlPostProcessor: { semanticPostProcess: (sparql: string) => string };
}

/**
 * Lets widgets be added without touching the switches of WidgetFactory and
 * ValueBuilderFactory. The built-in widgets still go through those switches;
 * the factories look here first.
 */
export class WidgetRegistry {
  static #widgets = new Map<string, (ctx: WidgetBuildContext) => AbstractWidget>();
  static #valueBuilders = new Map<string, () => ValueBuilderIfc>();
  static #endLabels = new Map<string, () => string>();

  static registerWidget(
    widgetUri: string,
    build: (ctx: WidgetBuildContext) => AbstractWidget,
    endLabel?: () => string,
  ) {
    WidgetRegistry.#widgets.set(widgetUri, build);
    if (endLabel) WidgetRegistry.#endLabels.set(widgetUri, endLabel);
  }

  static registerValueBuilder(widgetUri: string, build: () => ValueBuilderIfc) {
    WidgetRegistry.#valueBuilders.set(widgetUri, build);
  }

  static buildWidget(widgetUri: string, ctx: WidgetBuildContext): AbstractWidget | undefined {
    return WidgetRegistry.#widgets.get(widgetUri)?.(ctx);
  }

  static buildValueBuilder(widgetUri: string): ValueBuilderIfc | undefined {
    return WidgetRegistry.#valueBuilders.get(widgetUri)?.();
  }

  static getEndLabel(widgetUri: string): string | undefined {
    return WidgetRegistry.#endLabels.get(widgetUri)?.();
  }
}
