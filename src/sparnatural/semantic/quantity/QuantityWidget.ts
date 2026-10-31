import { AbstractWidget, ValueRepetition } from "../../components/widgets/AbstractWidget";
import { AddUserInputBtn } from "../../components/buttons/AddUserInputBtn";
import { HTMLComponent } from "../../components/HtmlComponent";
import { SelectedVal } from "../../components/SelectedVal";
import { I18n } from "../../settings/I18n";
import { Criteria, LabelledCriteria, QuantityCriteria } from "../../SparnaturalQueryIfc";
import { allUnits, findUnit, QudtUnit, unitsOfKinds } from "./QudtUnits";
import { QUANTITY_OPERATORS } from "./QuantityValueBuilder";
import { UNIT } from "../SemanticVocabulary";

const label = (key: string, fallback: string): string => I18n.labels?.[key] ?? fallback;

const OPERATOR_SYMBOLS: { [op: string]: string } = {
  "=": "=",
  "!=": "≠",
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
};

export interface QuantityWidgetConfiguration {
  // QUDT quantity kind IRIs the units are chosen from
  quantityKinds: string[];
  defaultUnit?: string;
}

function unitText(u: QudtUnit | undefined, iri: string): string {
  return u ? u.symbol : iri.startsWith(UNIT) ? iri.substring(UNIT.length) : iri;
}

/**
 * The QUDT widget: an operator, one or two values and a unit chosen among the units of
 * the quantity kind of the property. Values stored in other units of the same kind
 * are converted before being compared.
 */
export class QuantityWidget extends AbstractWidget {
  #configuration: QuantityWidgetConfiguration;
  #operator!: JQuery<HTMLSelectElement>;
  #value!: JQuery<HTMLInputElement>;
  #value2!: JQuery<HTMLInputElement>;
  #and!: JQuery<HTMLElement>;
  #unit!: JQuery<HTMLSelectElement>;
  #error!: JQuery<HTMLElement>;

  constructor(
    configuration: QuantityWidgetConfiguration,
    parentComponent: HTMLComponent,
    startClassVal: SelectedVal,
    objectPropVal: SelectedVal,
    endClassVal: SelectedVal,
  ) {
    super("quantity-widget", parentComponent, null, startClassVal, objectPropVal, endClassVal, ValueRepetition.SINGLE);
    this.#configuration = configuration;
  }

  render(): this {
    super.render();
    this.#operator = $(`<select aria-label="${label("QuantityOperator", "Comparison")}"></select>`) as JQuery<HTMLSelectElement>;
    QUANTITY_OPERATORS.forEach((op) =>
      this.#operator.append(`<option value="${op}">${operatorLabel(op)}</option>`),
    );
    this.#operator.val(">=");
    this.#operator[0].addEventListener("change", () => this.#showSecondValue());

    this.#value = $(`<input type="number" step="any" aria-label="${label("QuantityValue", "Value")}" />`) as JQuery<HTMLInputElement>;
    this.#value2 = $(`<input type="number" step="any" aria-label="${label("QuantityValue2", "Upper value")}" />`) as JQuery<HTMLInputElement>;
    this.#and = $(`<span>${label("NumberLabelAnd", "and")}</span>`);

    this.#unit = $(`<select aria-label="${label("QuantityUnit", "Unit")}"></select>`) as JQuery<HTMLSelectElement>;
    const lang = I18n.labels?.LangCodeTimeDate?.startsWith("fr") ? "fr" : "en";
    this.#units().forEach((u) =>
      this.#unit.append(`<option value="${u.iri}">${u.symbol} – ${u.label[lang]}</option>`),
    );
    if (this.#configuration.defaultUnit) this.#unit.val(this.#configuration.defaultUnit);

    const form = $(`<form class="quantity-row"></form>`).append(
      this.#operator,
      this.#value,
      this.#and,
      this.#value2,
      this.#unit,
    );
    form[0].addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.#add();
    });
    this.html.append(form);
    this.#error = $(`<div class="quantity-error" role="alert"></div>`);
    this.html.append(this.#error);
    new AddUserInputBtn(this, label("ButtonAdd", "Add"), () => this.#add()).render();

    this.#showSecondValue();
    return this;
  }

  // the units of the quantity kinds, or all units when the kind is not known
  #units(): QudtUnit[] {
    const kinds = this.#configuration.quantityKinds.length
      ? this.#configuration.quantityKinds
      : findUnit(this.#configuration.defaultUnit ?? "")?.quantityKinds ?? [];
    return kinds.length ? unitsOfKinds(kinds) : allUnits();
  }

  #showSecondValue() {
    const between = this.#operator.val() === "between";
    this.#value2.toggle(between);
    this.#and.toggle(between);
  }

  #add() {
    const criteria: QuantityCriteria = {
      quantityOperator: String(this.#operator.val()),
      value: parseFloat(String(this.#value.val())),
      unit: String(this.#unit.val()),
    };
    if (criteria.quantityOperator === "between") criteria.value2 = parseFloat(String(this.#value2.val()));
    try {
      this.parseInput({ label: "", criteria });
    } catch (e) {
      this.#error.text(
        criteria.quantityOperator === "between"
          ? label("QuantityInvalidRange", "Enter two values, the first one not above the second one.")
          : label("QuantityInvalid", "Enter a value."),
      );
      return;
    }
    this.#error.text("");
    this.triggerRenderWidgetVal(this.buildValueFromCriteria(criteria));
  }

  getValueLabel(criteria: Criteria): string {
    const c = criteria as QuantityCriteria;
    const unit = unitText(findUnit(c.unit), c.unit);
    if (c.quantityOperator === "between") {
      return `${operatorLabel("between")} ${c.value} ${label("NumberLabelAnd", "and")} ${c.value2} ${unit}`;
    }
    return `${OPERATOR_SYMBOLS[c.quantityOperator] ?? c.quantityOperator} ${c.value} ${unit}`;
  }

  parseInput(input: LabelledCriteria<Criteria>): LabelledCriteria<Criteria> {
    const c = input.criteria as QuantityCriteria;
    const valid =
      QUANTITY_OPERATORS.includes(c.quantityOperator) &&
      isFinite(c.value) &&
      !!c.unit &&
      (c.quantityOperator !== "between" || (isFinite(c.value2) && c.value2 >= c.value));
    if (!valid) throw Error(`Invalid quantity criteria: ${JSON.stringify(c)}`);
    return input;
  }

  /**
   * Parses "operator|value|unit" or "between|min|max|unit", the unit as a QUDT IRI or
   * a local name ("KiloGM"), e.g. ">=|2|KiloGM"
   */
  parseRawValue(raw: string): Criteria {
    const parts = (raw ?? "").split("|").map((s) => s.trim());
    const between = parts[0] === "between";
    const unit = parts[between ? 3 : 2] ?? "";
    const criteria: QuantityCriteria = {
      quantityOperator: parts[0],
      value: parseFloat(parts[1]),
      unit: unit.includes(":") ? unit : UNIT + unit,
    };
    if (between) criteria.value2 = parseFloat(parts[2]);
    this.parseInput({ label: "", criteria });
    return criteria;
  }

  // a quantity is never a URI
  protected holdsUriValues(): boolean {
    return false;
  }
}

export function operatorLabel(op: string): string {
  if (op === "between") return label("NumberLabelBetween", "between");
  return OPERATOR_SYMBOLS[op] ?? op;
}
