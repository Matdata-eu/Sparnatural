import { QuantityCriteria } from "../../SparnaturalQueryIfc";
import { Config } from "../../ontologies/SparnaturalConfig";
import { SemanticValueBuilder } from "../SemanticValueBuilder";
import { QUDT, XSD } from "../SemanticVocabulary";
import { findUnit, QudtUnit, toSI, unitsOfKinds } from "./QudtUnits";

export const QUANTITY_OPERATORS = ["=", "!=", "<", "<=", ">", ">=", "between"];

const UNIT_PATH =
  `(<${QUDT}quantityValue>/(<${QUDT}unit>|<${QUDT}hasUnit>))|<${QUDT}unit>|<${QUDT}hasUnit>`;
const KIND_PATH = `<${QUDT}hasQuantityKind>|<${QUDT}unitForQuantityKind>`;

// relative tolerance of comparisons, so that values equal after a conversion stay equal
const RELATIVE_TOLERANCE = 1e-9;
const ABSOLUTE_TOLERANCE = 1e-12;

/**
 * @returns a number in SPARQL syntax, as an xsd:double so that very small or very large
 * conversion factors keep their precision
 */
export function double(n: number): string {
  if (!isFinite(n)) throw new Error(`Not a finite number: ${n}`);
  return n.toExponential();
}

/**
 * Translates the QUDT widget to SPARQL 1.1. The value and unit are read from the
 * qudt:QuantityValue (or from the qudt:QuantityValue of a qudt:Quantity), the value is
 * converted to SI, value_SI = (value + conversionOffset) * conversionMultiplier, and
 * compared with the criteria converted the same way, with a relative tolerance of 1e-9.
 *
 * The conversion factors come from:
 * - core:ClientSide (default): the QUDT unit table bundled with Sparnatural, written in
 *   the query as a VALUES block limited to the quantity kind of the property, so units
 *   of another kind (a mass in metres) never match
 * - core:Endpoint: the QUDT units graph loaded in the triplestore
 *
 * The quantity kind is qudt:hasQuantityKind on the property shape, otherwise the kinds
 * of core:defaultUnit, otherwise the kinds of the units of the criteria.
 *
 * The object variable shows the value converted to core:defaultUnit when it is set, so
 * that the column has one unit (as an xsd:decimal, easier to read than a double), and
 * the value as stored otherwise.
 */
export class QuantityValueBuilder extends SemanticValueBuilder {
  protected buildSparql(): string {
    const criterias = ((this.values ?? []) as QuantityCriteria[]).filter((c) => this.#isValid(c));
    const invalid = (this.values?.length ?? 0) - criterias.length;
    if (invalid > 0) console.warn(`Ignoring ${invalid} invalid quantity criteria`, this.values);

    const defaultUnit = this.#defaultUnit;
    if (criterias.length === 0 && invalid === 0) {
      if (!this.endClassVarSelected) return this.joinTriple;
      if (!defaultUnit) {
        return `${this.joinTriple}
OPTIONAL { ${this.nodeVar} ${this.valuePath} ${this.valueVar} . }`;
      }
      return `${this.joinTriple}
OPTIONAL {
  ${this.#readAndConvert(criterias)}
  ${this.#display(defaultUnit)}
}`;
    }
    if (criterias.length === 0) {
      return `${this.joinTriple}
FILTER(false)`;
    }

    const conditions = criterias.map((c, i) => this.#condition(c, i));
    return `${this.joinTriple}
${this.#readAndConvert(criterias)}
${this.#referenceFactors(criterias)}
${this.#display(defaultUnit)}
FILTER(${conditions.map((c) => `(${c})`).join(" || ")})`;
  }

  get #endpointMode(): boolean {
    return this.specProperty.getConfigValues(Config.UNIT_CONVERSION).includes(Config.UNIT_CONVERSION_ENDPOINT);
  }

  get #defaultUnit(): string | undefined {
    return this.specProperty.getConfigValues(Config.DEFAULT_UNIT)[0];
  }

  #isValid(c: QuantityCriteria): boolean {
    if (!QUANTITY_OPERATORS.includes(c.quantityOperator)) return false;
    if (!isFinite(c.value)) return false;
    if (c.quantityOperator === "between" && !(isFinite(c.value2) && c.value2 >= c.value)) return false;
    // the unit must be known to convert on the client side
    return this.#endpointMode ? !!c.unit : !!findUnit(c.unit);
  }

  // the quantity kinds the units are limited to
  #kinds(criterias: QuantityCriteria[]): string[] {
    const configured = this.specProperty.getConfigValues(`${QUDT}hasQuantityKind`);
    if (configured.length > 0) return configured;
    const defaultUnit = this.#defaultUnit && findUnit(this.#defaultUnit);
    if (defaultUnit) return defaultUnit.quantityKinds;
    return [...new Set(criterias.flatMap((c) => findUnit(c.unit)?.quantityKinds ?? []))];
  }

  // reads the value and its unit, and converts the value to SI in ?X_si
  #readAndConvert(criterias: QuantityCriteria[]): string {
    const [v, unit, m, o, si] = ["v", "unit", "m", "o", "si"].map((s) => this.var(s));
    const kinds = this.#kinds(criterias);
    let factors: string;
    if (this.#endpointMode) {
      const kindFilter =
        kinds.length === 0
          ? ""
          : `FILTER EXISTS { ${unit} ${KIND_PATH} ${this.var("kind")} . VALUES ${this.var("kind")} { ${kinds.map((k) => `<${k}>`).join(" ")} } }`;
      factors = `${unit} <${QUDT}conversionMultiplier> ${m} .
  OPTIONAL { ${unit} <${QUDT}conversionOffset> ${this.var("o0")} . }
  BIND(COALESCE(${this.var("o0")}, 0) AS ${o})
  FILTER(${m} != 0)
  ${kindFilter}`;
    } else {
      const units: QudtUnit[] = kinds.length > 0 ? unitsOfKinds(kinds) : criterias.map((c) => findUnit(c.unit)!);
      const rows = units.map((u) => `(<${u.iri}> ${double(u.multiplier)} ${double(u.offset)})`).join("\n    ");
      factors = `VALUES (${unit} ${m} ${o}) {
    ${rows}
  }`;
    }
    return `${this.nodeVar} ${this.valuePath} ${v} .
  ${this.nodeVar} ${UNIT_PATH} ${unit} .
  ${factors}
  BIND((${v} + ${o}) * ${m} AS ${si})`;
  }

  // in endpoint mode, the factors of the units of the criteria, read from the endpoint too
  #referenceFactors(criterias: QuantityCriteria[]): string {
    if (!this.#endpointMode) return "";
    return criterias
      .map((c, i) => `<${c.unit}> <${QUDT}conversionMultiplier> ${this.var(`rm${i}`)} .
OPTIONAL { <${c.unit}> <${QUDT}conversionOffset> ${this.var(`ro0${i}`)} . }
BIND(COALESCE(${this.var(`ro0${i}`)}, 0) AS ${this.var(`ro${i}`)})`)
      .join("\n");
  }

  // the value shown in the results
  #display(defaultUnit: string | undefined): string {
    const si = this.var("si");
    if (!defaultUnit) return `BIND(${this.var("v")} AS ${this.valueVar})`;
    if (this.#endpointMode) {
      const [dm, dO] = [this.var("dm"), this.var("do")];
      return `OPTIONAL {
    <${defaultUnit}> <${QUDT}conversionMultiplier> ${dm} .
    OPTIONAL { <${defaultUnit}> <${QUDT}conversionOffset> ${this.var("do0")} . }
    BIND(COALESCE(${this.var("do0")}, 0) AS ${dO})
  }
  BIND(IF(BOUND(${dm}), <${XSD}decimal>(${si} / ${dm} - ${dO}), ${this.var("v")}) AS ${this.valueVar})`;
    }
    const unit = findUnit(defaultUnit);
    if (!unit) return `BIND(${this.var("v")} AS ${this.valueVar})`;
    return `BIND(<${XSD}decimal>(${si} / ${double(unit.multiplier)} - ${double(unit.offset)}) AS ${this.valueVar})`;
  }

  #condition(c: QuantityCriteria, i: number): string {
    const si = this.var("si");
    let ref: (n: number) => string;
    let tolerance: (n: number) => string;
    if (this.#endpointMode) {
      ref = (n) => `((${double(n)} + ${this.var(`ro${i}`)}) * ${this.var(`rm${i}`)})`;
      tolerance = (n) => `(${double(RELATIVE_TOLERANCE)} * ABS(${ref(n)}) + ${double(ABSOLUTE_TOLERANCE)})`;
    } else {
      const unit = findUnit(c.unit)!;
      ref = (n) => double(toSI(n, unit));
      tolerance = (n) => double(RELATIVE_TOLERANCE * Math.abs(toSI(n, unit)) + ABSOLUTE_TOLERANCE);
    }
    const r = ref(c.value);
    const t = tolerance(c.value);
    switch (c.quantityOperator) {
      case "=":
        return `ABS(${si} - ${r}) <= ${t}`;
      case "!=":
        return `ABS(${si} - ${r}) > ${t}`;
      case "<":
        return `${si} < ${r} - ${t}`;
      case "<=":
        return `${si} <= ${r} + ${t}`;
      case ">":
        return `${si} > ${r} + ${t}`;
      case ">=":
        return `${si} >= ${r} - ${t}`;
      case "between":
        return `${si} >= ${r} - ${t} && ${si} <= ${ref(c.value2)} + ${tolerance(c.value2)}`;
    }
    return "false";
  }
}
