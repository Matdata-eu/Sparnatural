import { Pattern } from "sparqljs";
import { BaseValueBuilder } from "../generators/sparql/ValueBuilder";
import ISpecificationProperty from "../spec-providers/ISpecificationProperty";
import { SemanticPattern, SemanticPatternRegistry } from "./SemanticPatterns";
import { SH_CLASS } from "./SemanticVocabulary";
import { SparqlFragment } from "./SparqlFragment";

/**
 * Base of the value builders of the semantic widgets. The property points to an
 * intermediate node (?X_node), and the builder itself joins that node to its literal,
 * which is bound to the object variable ?X. So when ?X is selected, the result shows
 * the final value (a date, a WKT, a number) and not the intermediate node.
 *
 *   ?subject <property> ?X_node .
 *   ?X_node <value path> ?X .
 */
export abstract class SemanticValueBuilder extends BaseValueBuilder {
  protected readonly pattern: SemanticPattern;

  constructor(pattern: SemanticPattern) {
    super();
    this.pattern = pattern;
  }

  // the builder writes the triple between subject and object itself, even without values
  alwaysBuild(): boolean {
    return true;
  }

  isBlockingObjectProp(): boolean {
    return true;
  }

  // the object is a literal, never typed
  isBlockingEnd(): boolean {
    return true;
  }

  build(): Pattern[] {
    return SparqlFragment.parse(this.buildSparql());
  }

  /**
   * @returns the SPARQL graph pattern, as text with full IRIs
   */
  protected abstract buildSparql(): string;

  protected hasCriteria(): boolean {
    return this.values?.length > 0;
  }

  protected get subjectVar(): string {
    return "?" + this.startClassVal.value;
  }

  protected get nodeVar(): string {
    return this.var("node");
  }

  protected get valueVar(): string {
    return "?" + this.endClassVal.value;
  }

  // a helper variable, unique to this criteria
  protected var(suffix: string): string {
    return `?${this.endClassVal.value}_${suffix}`;
  }

  protected get propertyIri(): string {
    return `<${this.propertyVal.value}>`;
  }

  protected get specProperty(): ISpecificationProperty {
    return this.specProvider.getProperty(this.propertyVal.value);
  }

  /**
   * @returns core:valuePath if set on the property, otherwise the default path of the pattern
   */
  protected get valuePath(): string {
    return (
      this.specProperty.getValuePath() ??
      SemanticPatternRegistry.valuePath(
        this.pattern,
        this.specProperty.getConfigValues(SH_CLASS),
      )
    );
  }

  // the triple from the subject to the intermediate node
  protected get joinTriple(): string {
    return `${this.subjectVar} ${this.propertyIri} ${this.nodeVar} .`;
  }
}

/**
 * Follows the value path and nothing else : selecting the variable shows the final value.
 * The value is OPTIONAL so that nodes without a value (yet) still appear.
 */
export class ValuePathValueBuilder extends SemanticValueBuilder {
  protected buildSparql(): string {
    return `${this.joinTriple}
OPTIONAL { ${this.nodeVar} ${this.valuePath} ${this.valueVar} . }`;
  }
}
