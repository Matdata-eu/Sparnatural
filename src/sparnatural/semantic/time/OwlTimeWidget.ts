import { AbstractWidget, ValueRepetition } from "../../components/widgets/AbstractWidget";
import { AddUserInputBtn } from "../../components/buttons/AddUserInputBtn";
import { HTMLComponent } from "../../components/HtmlComponent";
import { SelectedVal } from "../../components/SelectedVal";
import { I18n } from "../../settings/I18n";
import { Criteria, LabelledCriteria, TimeCriteria } from "../../SparnaturalQueryIfc";
import { findTimeRelation, TIME_RELATIONS, TimeRelation } from "./TimeRelations";
import { parseMoment, referencePeriod, TimeGranularity } from "./TimeReference";

const GRANULARITIES: TimeGranularity[] = ["year", "month", "day", "minute"];

const INPUT_TYPES: { [g in TimeGranularity]: string } = {
  year: "number",
  month: "month",
  day: "date",
  minute: "datetime-local",
};

const PLACEHOLDERS: { [g in TimeGranularity]: string } = {
  year: "YYYY",
  month: "YYYY-MM",
  day: "YYYY-MM-DD",
  minute: "YYYY-MM-DDThh:mm",
};

const label = (key: string, fallback: string): string => I18n.labels?.[key] ?? fallback;

/**
 * @returns the granularity a value is written in, e.g. "month" for "2020-03"
 */
export function detectGranularity(value: string): TimeGranularity | undefined {
  return GRANULARITIES.find((g) => parseMoment(value, g) !== undefined);
}

/**
 * The OWL-Time widget: the time of the value is in a relation (within, intersects,
 * before, after, or one of the Allen relations) with a reference period, given as one
 * period or a from-to range, in years, months, days or minutes.
 */
export class OwlTimeWidget extends AbstractWidget {
  #relation = "within";
  #showAll = false;
  #range = false;
  #granularity: TimeGranularity = "year";

  #relationList!: JQuery<HTMLElement>;
  #toggleAll!: JQuery<HTMLElement>;
  #inputs!: JQuery<HTMLElement>;
  #start!: JQuery<HTMLInputElement>;
  #stop?: JQuery<HTMLInputElement>;
  #error!: JQuery<HTMLElement>;

  constructor(
    parentComponent: HTMLComponent,
    startClassVal: SelectedVal,
    objectPropVal: SelectedVal,
    endClassVal: SelectedVal,
  ) {
    super(
      "owltime-widget",
      parentComponent,
      null,
      startClassVal,
      objectPropVal,
      endClassVal,
      ValueRepetition.SINGLE,
    );
  }

  render(): this {
    super.render();

    this.#relationList = $(`<div class="owltime-relations" role="radiogroup"></div>`);
    this.#toggleAll = $(`<button type="button" class="owltime-link"></button>`);
    this.#toggleAll[0].addEventListener("click", () => {
      this.#showAll = !this.#showAll;
      if (!this.#showAll && !findTimeRelation(this.#relation)?.everyday) {
        this.#relation = "within";
      }
      this.#renderRelations();
    });
    this.html.append(
      $(`<div class="owltime-section"></div>`).append(this.#relationList, this.#toggleAll),
    );

    const mode = this.#segmented(
      [
        ["point", label("OwlTimeOnePeriod", "One period")],
        ["range", label("OwlTimeRange", "From – to")],
      ],
      "point",
      (v) => {
        this.#range = v === "range";
        this.#renderInputs();
      },
    );
    const granularity = this.#segmented(
      GRANULARITIES.map((g) => [g, label(`OwlTimeGranularity.${g}`, g)]),
      this.#granularity,
      (v) => {
        this.#granularity = v as TimeGranularity;
        this.#renderInputs();
      },
    );
    this.html.append(
      $(`<div class="owltime-row"></div>`).append(mode, granularity),
    );

    this.#inputs = $(`<div class="owltime-row owltime-inputs"></div>`);
    this.html.append(this.#inputs);
    this.#error = $(`<div class="owltime-error" role="alert"></div>`);
    this.html.append(this.#error);

    this.#renderRelations();
    this.#renderInputs();

    new AddUserInputBtn(this, label("ButtonAdd", "Add"), this.#add).render();
    return this;
  }

  #segmented(
    options: string[][],
    selected: string,
    onChange: (value: string) => void,
  ): JQuery<HTMLElement> {
    const group = $(`<div class="owltime-seg"></div>`);
    options.forEach(([value, text]) => {
      const btn = $(
        `<button type="button" aria-pressed="${value === selected}">${text}</button>`,
      );
      btn[0].addEventListener("click", () => {
        group.children().attr("aria-pressed", "false");
        btn.attr("aria-pressed", "true");
        onChange(value);
      });
      group.append(btn);
    });
    return group;
  }

  #renderRelations() {
    const shown = TIME_RELATIONS.filter((r) => this.#showAll || r.everyday);
    this.#relationList.empty();
    shown.forEach((r, i) => {
      if (this.#showAll && i === 0) {
        this.#relationList.append(`<div class="owltime-sub">${label("OwlTimeEveryday", "Everyday")}</div>`);
      }
      if (this.#showAll && i > 0 && r.everyday !== shown[i - 1].everyday) {
        this.#relationList.append(`<div class="owltime-sub">${label("OwlTimeAllen", "Allen relations")}</div>`);
      }
      const checked = r.id === this.#relation;
      const owl = r.owlTime ? `time:${r.owlTime.split("#")[1]}` : "";
      const item = $(`<label class="owltime-relation${checked ? " on" : ""}">
        <input type="radio" name="owltime-relation-${this.endClassVal?.variable ?? ""}" value="${r.id}"${checked ? " checked" : ""}>
        ${relationDiagram(r)}
        <span><span class="owltime-name">${relationLabel(r.id)}</span><span class="owltime-owl">${owl}</span></span>
      </label>`);
      item.find("input")[0].addEventListener("change", () => {
        this.#relation = r.id;
        this.#renderRelations();
      });
      this.#relationList.append(item);
    });
    this.#toggleAll.text(
      this.#showAll
        ? label("OwlTimeShowEveryday", "Show only the everyday choices")
        : label("OwlTimeShowAll", "Show all relations"),
    );
  }

  #renderInputs() {
    const previous = [this.#start?.val(), this.#stop?.val()] as string[];
    this.#inputs.empty();
    const type = INPUT_TYPES[this.#granularity];
    const attrs = type === "number" ? ` min="-999999" max="999999" step="1"` : "";
    const input = (aria: string) =>
      $(
        `<input type="${type}"${attrs} placeholder="${PLACEHOLDERS[this.#granularity]}" aria-label="${aria}" />`,
      ) as JQuery<HTMLInputElement>;

    this.#start = input(label("OwlTimeReferenceStart", "Reference start"));
    this.#inputs.append(
      `<span>${this.#range ? label("LabelDateFrom", "from") : label("OwlTimeIn", "in")}</span>`,
      this.#start,
    );
    this.#stop = undefined;
    if (this.#range) {
      this.#stop = input(label("OwlTimeReferenceEnd", "Reference end"));
      this.#inputs.append(`<span>${label("LabelDateTo", "to")}</span>`, this.#stop);
    }
    if (this.#granularity === "year") {
      this.#inputs.append(`<span class="owltime-hint">${label("OwlTimeBCHint", "BC years: type a negative year")}</span>`);
    }
    // keep what was typed when the value still fits the granularity
    [this.#start, this.#stop].forEach((el, i) => {
      if (el && previous[i] && parseMoment(previous[i], this.#granularity)) el.val(previous[i]);
    });
    this.#error.text("");
  }

  #add = () => {
    const criteria: TimeCriteria = {
      timeRelation: this.#relation,
      granularity: this.#granularity,
      start: String(this.#start.val() ?? "").trim(),
    };
    const stop = String(this.#stop?.val() ?? "").trim();
    if (stop !== "") criteria.stop = stop;

    if (!referencePeriod(criteria)) {
      this.#error.text(label("OwlTimeInvalid", "Enter a valid period: the end cannot be before the start."));
      return;
    }
    this.#error.text("");
    this.triggerRenderWidgetVal(this.buildValueFromCriteria(criteria));
  };

  getValueLabel(criteria: Criteria): string {
    const c = criteria as TimeCriteria;
    const period = c.stop && c.stop !== c.start ? `${c.start} – ${c.stop}` : c.start;
    return `${relationLabel(c.timeRelation)} ${period}`;
  }

  parseInput(input: LabelledCriteria<Criteria>): LabelledCriteria<Criteria> {
    const c = input.criteria as TimeCriteria;
    if (!findTimeRelation(c.timeRelation) || !referencePeriod(c)) {
      throw Error(`Invalid time criteria: ${JSON.stringify(c)}`);
    }
    return input;
  }

  /**
   * Parses "relation|start|stop" (stop optional), e.g. "intersects|2020-03|2020-06".
   * The granularity is read from how start is written.
   */
  parseRawValue(raw: string): Criteria {
    const [relation, start, stop] = (raw ?? "").split("|").map((s) => s.trim());
    const granularity = detectGranularity(start);
    if (!findTimeRelation(relation) || !granularity) {
      throw Error(`Invalid time value: ${raw}`);
    }
    const criteria: TimeCriteria = { timeRelation: relation, granularity, start };
    if (stop) criteria.stop = stop;
    return criteria;
  }
}

export function relationLabel(id: string): string {
  return label(`OwlTimeRelation.${id}`, id);
}

// the value bar above the reference bar, as in the OWL-Time specification drawings
function relationDiagram(r: TimeRelation): string {
  const [x1, x2] = r.bar;
  return `<svg class="owltime-diagram" viewBox="0 0 120 22" aria-hidden="true">
    <rect class="owltime-ref" x="40" y="13" width="40" height="6" rx="3"/>
    <rect class="owltime-val" x="${x1}" y="3" width="${Math.max(2, x2 - x1)}" height="6" rx="3"/>
  </svg>`;
}
