import { TIME } from "../SemanticVocabulary";

/**
 * Builds the SPARQL condition of one relation, from three helpers:
 * - begin(op, ref): compares the begin of the value with a bound of the reference period
 * - end(op, ref): compares the end of the value with a bound of the reference period
 * - open: true when the value has no end (an open interval, the end is +infinity)
 * "B1" is the begin of the reference period and "B2" its end (excluded).
 */
export interface ConditionBuilder {
  begin(op: string, ref: "B1" | "B2"): string;
  end(op: string, ref: "B1" | "B2"): string;
  hasEnd: string;
  open: string;
}

export interface TimeRelation {
  id: string;
  // OWL-Time property that this relation implements, when there is one
  owlTime?: string;
  everyday: boolean;
  // drawing of the relation: x positions (0-120) of the value bar, the reference bar
  // being drawn from 40 to 80
  bar: [number, number];
  condition: (c: ConditionBuilder) => string;
}

const and = (...parts: string[]) => parts.map((p) => `(${p})`).join(" && ");
const or = (...parts: string[]) => parts.map((p) => `(${p})`).join(" || ");

/**
 * The relations offered by the OWL-Time widget: everyday ones first, then the 13 Allen
 * relations, then intervalIn and intervalDisjoint.
 * Values are read as half-open intervals [begin, end); an instant lasts as long as its
 * datatype says (a whole year for an xsd:gYear, a day for an xsd:date).
 */
export const TIME_RELATIONS: TimeRelation[] = [
  {
    id: "within",
    everyday: true,
    bar: [46, 74],
    condition: (c) => and(c.begin(">=", "B1"), c.hasEnd, c.end("<=", "B2")),
  },
  {
    id: "intersects",
    everyday: true,
    bar: [22, 58],
    condition: (c) => and(c.begin("<", "B2"), or(c.open, c.end(">", "B1"))),
  },
  {
    id: "before",
    owlTime: `${TIME}before`,
    everyday: true,
    bar: [8, 40],
    condition: (c) => and(c.hasEnd, c.end("<=", "B1")),
  },
  {
    id: "after",
    owlTime: `${TIME}after`,
    everyday: true,
    bar: [80, 112],
    condition: (c) => c.begin(">=", "B2"),
  },
  {
    id: "intervalBefore",
    owlTime: `${TIME}intervalBefore`,
    everyday: false,
    bar: [6, 30],
    condition: (c) => and(c.hasEnd, c.end("<", "B1")),
  },
  {
    id: "intervalMeets",
    owlTime: `${TIME}intervalMeets`,
    everyday: false,
    bar: [14, 40],
    condition: (c) => and(c.hasEnd, c.end("=", "B1")),
  },
  {
    id: "intervalOverlaps",
    owlTime: `${TIME}intervalOverlaps`,
    everyday: false,
    bar: [24, 58],
    condition: (c) =>
      and(c.begin("<", "B1"), c.hasEnd, c.end(">", "B1"), c.end("<", "B2")),
  },
  {
    id: "intervalStarts",
    owlTime: `${TIME}intervalStarts`,
    everyday: false,
    bar: [40, 62],
    condition: (c) => and(c.begin("=", "B1"), c.hasEnd, c.end("<", "B2")),
  },
  {
    id: "intervalDuring",
    owlTime: `${TIME}intervalDuring`,
    everyday: false,
    bar: [50, 70],
    condition: (c) => and(c.begin(">", "B1"), c.hasEnd, c.end("<", "B2")),
  },
  {
    id: "intervalFinishes",
    owlTime: `${TIME}intervalFinishes`,
    everyday: false,
    bar: [58, 80],
    condition: (c) => and(c.begin(">", "B1"), c.hasEnd, c.end("=", "B2")),
  },
  {
    id: "intervalEquals",
    owlTime: `${TIME}intervalEquals`,
    everyday: false,
    bar: [40, 80],
    condition: (c) => and(c.begin("=", "B1"), c.hasEnd, c.end("=", "B2")),
  },
  {
    id: "intervalFinishedBy",
    owlTime: `${TIME}intervalFinishedBy`,
    everyday: false,
    bar: [20, 80],
    condition: (c) => and(c.begin("<", "B1"), c.hasEnd, c.end("=", "B2")),
  },
  {
    id: "intervalContains",
    owlTime: `${TIME}intervalContains`,
    everyday: false,
    bar: [24, 96],
    condition: (c) => and(c.begin("<", "B1"), or(c.open, c.end(">", "B2"))),
  },
  {
    id: "intervalStartedBy",
    owlTime: `${TIME}intervalStartedBy`,
    everyday: false,
    bar: [40, 100],
    condition: (c) => and(c.begin("=", "B1"), or(c.open, c.end(">", "B2"))),
  },
  {
    id: "intervalOverlappedBy",
    owlTime: `${TIME}intervalOverlappedBy`,
    everyday: false,
    bar: [62, 96],
    condition: (c) =>
      and(c.begin(">", "B1"), c.begin("<", "B2"), or(c.open, c.end(">", "B2"))),
  },
  {
    id: "intervalMetBy",
    owlTime: `${TIME}intervalMetBy`,
    everyday: false,
    bar: [80, 106],
    condition: (c) => c.begin("=", "B2"),
  },
  {
    id: "intervalAfter",
    owlTime: `${TIME}intervalAfter`,
    everyday: false,
    bar: [90, 114],
    condition: (c) => c.begin(">", "B2"),
  },
  {
    // within, but not equal: OWL-Time's definition of intervalIn
    id: "intervalIn",
    owlTime: `${TIME}intervalIn`,
    everyday: false,
    bar: [48, 72],
    condition: (c) =>
      and(
        c.begin(">=", "B1"),
        c.hasEnd,
        c.end("<=", "B2"),
        or(c.begin(">", "B1"), c.end("<", "B2")),
      ),
  },
  {
    id: "intervalDisjoint",
    owlTime: `${TIME}intervalDisjoint`,
    everyday: false,
    bar: [6, 30],
    condition: (c) => or(and(c.hasEnd, c.end("<=", "B1")), c.begin(">=", "B2")),
  },
];

export function findTimeRelation(id: string): TimeRelation | undefined {
  return TIME_RELATIONS.find((r) => r.id === id);
}
