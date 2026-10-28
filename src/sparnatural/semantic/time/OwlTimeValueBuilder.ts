import { TimeCriteria } from "../../SparnaturalQueryIfc";
import { SemanticValueBuilder } from "../SemanticValueBuilder";
import { SparqlFragment } from "../SparqlFragment";
import { TIME, XSD } from "../SemanticVocabulary";
import { Pattern } from "sparqljs";
import { findTimeRelation, ConditionBuilder } from "./TimeRelations";
import { addUnit, Moment, referencePeriod, toXsdDateTime } from "./TimeReference";

const PREFIXES = { time: TIME, xsd: XSD };

const INSTANT_VALUE =
  "time:inXSDDateTimeStamp|time:inXSDDateTime|time:inXSDDate|time:inXSDgYearMonth|time:inXSDgYear";

// a timezone at the end of a lexical form
const TZ = `"(Z|[+-][0-9][0-9]:[0-9][0-9])$"`;

/**
 * Translates the OWL-Time widget to SPARQL 1.1, without any extension function.
 *
 * The time of the value is read as a half-open interval [begin, end) of xsd:dateTime:
 * - an Instant is its own beginning and end ; an Interval has time:hasBeginning and
 *   time:hasEnd, and no time:hasEnd means an open interval
 * - an instant is read from time:inXSD* or from a time:inDateTime description ; a
 *   time:DateTimeInterval from its time:hasDateTimeDescription
 * - a value lasts as long as its datatype says: a whole year for an xsd:gYear, a month
 *   for an xsd:gYearMonth, a day for an xsd:date, no time for an xsd:dateTime
 * - values without a timezone are read as UTC
 *
 * SPARQL 1.1 cannot add a year or a month to a date, so the end of a value is never
 * computed: "end OP bound" is written "endStart OP (bound minus the length of the
 * datatype of the end)", the subtraction being done here.
 *
 * The object variable shows the original literal for an instant, and "begin/end"
 * (ISO 8601 interval, ".." when open) for an interval.
 *
 * When core:valuePath is set on the property, the literal it reaches is read as an
 * instant.
 *
 * "(time:hasBeginning/x)|x" is used rather than "time:hasBeginning?/x": it means the
 * same, and some engines (Comunica 4) lose the zero-length matches of "?".
 */
export class OwlTimeValueBuilder extends SemanticValueBuilder {
  build(): Pattern[] {
    return SparqlFragment.parse(this.buildSparql(), PREFIXES);
  }

  protected buildSparql(): string {
    const criterias = (this.values ?? []) as TimeCriteria[];

    if (criterias.length === 0) {
      if (!this.endClassVarSelected) return this.joinTriple;
      return `${this.joinTriple}
OPTIONAL {
  ${this.#read("b")}
  OPTIONAL { ${this.#read("e")} }
  ${this.#display()}
}`;
    }

    return `${this.joinTriple}
${this.#read("b")}
OPTIONAL { ${this.#read("e")} }
${this.#display()}
FILTER(${this.#filter(criterias)})`;
  }

  // reads the begin ("b") or the end ("e") of the node, into ?X_b / ?X_e (xsd:dateTime),
  // with the original lexical form and datatype in ?X_blex / ?X_bdt
  #read(side: "b" | "e"): string {
    const v = (s: string) => this.var(side + s);
    const lex = v("lex");
    const dt = v("dt");

    let source: string;
    const customPath = this.specProperty.getValuePath();
    if (customPath) {
      source = `${this.nodeVar} ${customPath} ${v("v")} .
  BIND(STR(${v("v")}) AS ${lex})
  BIND(DATATYPE(${v("v")}) AS ${dt})`;
    } else {
      const step = side === "b" ? "time:hasBeginning" : "time:hasEnd";
      source = `{
    ${this.nodeVar} (${step}/(${INSTANT_VALUE}))|${INSTANT_VALUE} ${v("v")} .
    BIND(STR(${v("v")}) AS ${lex})
    BIND(DATATYPE(${v("v")}) AS ${dt})
  } UNION {
    ${this.nodeVar} (${step}/time:inDateTime)|time:inDateTime ${v("d")} .
    ${this.#readDescription(v("d"), side)}
  } UNION {
    ${this.nodeVar} time:hasDateTimeDescription ${v("d")} .
    ${this.#readDescription(v("d"), side)}
  }`;
    }

    // the start of the value as an xsd:dateTime string, in UTC when there is no timezone
    const noTz = `REPLACE(${lex}, ${TZ}, "")`;
    return `${source}
  BIND(
    IF(${dt} = xsd:gYear, CONCAT(${noTz}, "-01-01T00:00:00Z"),
    IF(${dt} = xsd:gYearMonth, CONCAT(${noTz}, "-01T00:00:00Z"),
    IF(${dt} = xsd:date, CONCAT(${noTz}, "T00:00:00Z"),
    IF(REGEX(${lex}, ${TZ}), ${lex}, CONCAT(${lex}, "Z")))))
    AS ${v("s")})
  BIND(xsd:dateTime(${v("s")}) AS ${this.var(side)})`;
  }

  // a time:DateTimeDescription read as an xsd:gYear, xsd:gYearMonth or xsd:date
  #readDescription(d: string, side: string): string {
    const v = (s: string) => this.var(side + s);
    const month = `SUBSTR(STR(${v("mo")}), 3, 2)`; // "--05" -> "05"
    const day = `SUBSTR(STR(${v("da")}), 4, 2)`; // "---09" -> "09"
    return `${d} time:year ${v("y")} .
    OPTIONAL { ${d} time:month ${v("mo")} . }
    OPTIONAL { ${d} time:day ${v("da")} . }
    BIND(IF(BOUND(${v("mo")}), IF(BOUND(${v("da")}), xsd:date, xsd:gYearMonth), xsd:gYear) AS ${v("dt")})
    BIND(CONCAT(STR(${v("y")}), IF(BOUND(${v("mo")}), CONCAT("-", ${month}, IF(BOUND(${v("da")}), CONCAT("-", ${day}), "")), "")) AS ${v("lex")})`;
  }

  // the value shown in the results
  #display(): string {
    const [blex, bdt, elex, edt] = ["blex", "bdt", "elex", "edt"].map((s) => this.var(s));
    return `BIND(
    IF(BOUND(${elex}) && sameTerm(${elex}, ${blex}) && sameTerm(${edt}, ${bdt}),
      STRDT(${blex}, ${bdt}),
      CONCAT(${blex}, "/", COALESCE(${elex}, "..")))
    AS ${this.valueVar})`;
  }

  #filter(criterias: TimeCriteria[]): string {
    const conditions = criterias
      .map((c) => this.#condition(c))
      .filter((c): c is string => c !== undefined);
    if (conditions.length === 0) return "false";
    return conditions.map((c) => `(${c})`).join(" || ");
  }

  #condition(criteria: TimeCriteria): string | undefined {
    const relation = findTimeRelation(criteria.timeRelation);
    const period = referencePeriod(criteria);
    if (!relation || !period) {
      console.warn("Ignoring an invalid time criteria", criteria);
      return undefined;
    }
    const bounds = { B1: period.begin, B2: period.end };
    const lit = (m: Moment) => SparqlFragment.literal(toXsdDateTime(m), `${XSD}dateTime`);
    const begin = this.var("b");
    const end = this.var("e");
    const endDt = this.var("edt");

    const c: ConditionBuilder = {
      begin: (op, ref) => `${begin} ${op} ${lit(bounds[ref])}`,
      // the end of the value is its start plus the length of its datatype
      end: (op, ref) => {
        const b = bounds[ref];
        return [
          `(${endDt} = xsd:gYear && ${end} ${op} ${lit(addUnit(b, "year", -1))})`,
          `(${endDt} = xsd:gYearMonth && ${end} ${op} ${lit(addUnit(b, "month", -1))})`,
          `(${endDt} = xsd:date && ${end} ${op} ${lit(addUnit(b, "day", -1))})`,
          `(${endDt} NOT IN (xsd:gYear, xsd:gYearMonth, xsd:date) && ${end} ${op} ${lit(b)})`,
        ].join(" || ");
      },
      hasEnd: `BOUND(${end})`,
      open: `!BOUND(${end})`,
    };
    return relation.condition(c);
  }
}
