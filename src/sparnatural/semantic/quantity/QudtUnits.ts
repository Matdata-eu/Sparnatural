import * as tableModule from "./qudt-units.json";
import { QUANTITY_KIND, UNIT } from "../SemanticVocabulary";

/**
 * A QUDT unit from the table bundled with Sparnatural (see scripts/build-qudt-units.mjs).
 * value in SI = (value + offset) * multiplier, the QUDT 3 convention.
 */
export interface QudtUnit {
  iri: string;
  symbol: string;
  label: { en: string; fr: string };
  multiplier: number;
  offset: number;
  // quantity kind IRIs
  quantityKinds: string[];
}

type Row = [string, string, string | 0, number, number, string[]];

// the JSON module is a default export with webpack, a namespace with ts-jest
const table: any = (tableModule as any).default ?? tableModule;

let byIri: Map<string, QudtUnit> | undefined;

function units(): Map<string, QudtUnit> {
  if (!byIri) {
    byIri = new Map();
    for (const [name, row] of Object.entries(table.units as { [name: string]: Row })) {
      const [symbol, en, fr, multiplier, offset, kinds] = row;
      const iri = UNIT + name;
      byIri.set(iri, {
        iri,
        symbol,
        label: { en, fr: fr || en },
        multiplier,
        offset,
        quantityKinds: kinds.map((k) => QUANTITY_KIND + k),
      });
    }
  }
  return byIri;
}

export const QUDT_UNITS_SOURCE: string = table.source;

export function findUnit(iri: string): QudtUnit | undefined {
  return units().get(iri);
}

/**
 * @returns the units of any of the given quantity kinds, by symbol
 */
export function unitsOfKinds(kinds: string[]): QudtUnit[] {
  return [...units().values()]
    .filter((u) => u.quantityKinds.some((k) => kinds.includes(k)))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function allUnits(): QudtUnit[] {
  return [...units().values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function toSI(value: number, unit: QudtUnit): number {
  return (value + unit.offset) * unit.multiplier;
}
