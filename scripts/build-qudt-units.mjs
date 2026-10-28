/**
 * Builds src/sparnatural/semantic/quantity/qudt-units.json, the unit table used by the
 * QUDT widget for its unit picker and for client-side unit conversion, from a QUDT
 * release:
 *
 *   node scripts/build-qudt-units.mjs v3.5.3
 *
 * Each unit is kept with its symbol, English and French labels, conversion multiplier
 * and offset, and quantity kinds. Deprecated units, and units without a linear
 * conversion (no multiplier, or 0), are left out.
 */
import { writeFileSync } from "fs";
import { Parser } from "n3";

const release = process.argv[2] ?? "v3.5.3";
const url = `https://raw.githubusercontent.com/qudt/qudt-public-repo/${release}/src/main/rdf/vocab/unit/VOCAB_QUDT-UNITS-ALL.ttl`;
const QUDT = "http://qudt.org/schema/qudt/";
const UNIT = "http://qudt.org/vocab/unit/";
const QK = "http://qudt.org/vocab/quantitykind/";

const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: ${response.status}`);
const quads = new Parser().parse(await response.text());

const units = new Map();
const get = (iri) => {
  if (!units.has(iri)) units.set(iri, { kinds: new Set(), labels: {} });
  return units.get(iri);
};
for (const { subject, predicate, object } of quads) {
  if (!subject.value.startsWith(UNIT)) continue;
  const u = get(subject.value);
  switch (predicate.value) {
    case `${QUDT}conversionMultiplier`: u.multiplier = Number(object.value); break;
    case `${QUDT}conversionOffset`: u.offset = Number(object.value); break;
    case `${QUDT}symbol`: u.symbol = object.value; break;
    case `${QUDT}hasQuantityKind`:
    case `${QUDT}unitForQuantityKind`:
      if (object.value.startsWith(QK)) u.kinds.add(object.value.substring(QK.length));
      break;
    case `${QUDT}deprecated`:
    case "http://www.w3.org/2002/07/owl#deprecated":
      if (object.value === "true") u.deprecated = true;
      break;
    case "http://www.w3.org/2000/01/rdf-schema#label":
      if (object.language === "en" || object.language === "fr") u.labels[object.language] = object.value;
      break;
  }
}

const table = {};
for (const [iri, u] of [...units].sort(([a], [b]) => a.localeCompare(b))) {
  if (u.deprecated || !u.multiplier || u.kinds.size === 0) continue;
  const name = iri.substring(UNIT.length);
  const en = u.labels.en ?? name;
  // [symbol, English label, French label (or 0 when the same), multiplier, offset, kinds]
  table[name] = [
    u.symbol ?? name,
    en,
    u.labels.fr && u.labels.fr !== en ? u.labels.fr : 0,
    u.multiplier,
    u.offset ?? 0,
    [...u.kinds].sort(),
  ];
}

const out = "src/sparnatural/semantic/quantity/qudt-units.json";
writeFileSync(
  out,
  JSON.stringify({
    source: `QUDT ${release}, ${url}`,
    // SI value = (value + offset) * multiplier
    format: ["symbol", "labelEn", "labelFr", "multiplier", "offset", "quantityKinds"],
    units: table,
  }),
);
console.log(`${Object.keys(table).length} units written to ${out}`);
