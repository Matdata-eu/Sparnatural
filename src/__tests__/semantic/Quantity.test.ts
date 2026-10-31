import { DataFactory, Store } from "n3";
import { QUANTITY_PATTERN } from "../../sparnatural/semantic/SemanticPatterns";
import { QuantityCriteria } from "../../sparnatural/SparnaturalQueryIfc";
import { LabelledFilter } from "../../sparnatural/SparnaturalQueryIfc-v13";
import { labelledCriteriaToFilters, translateFilters } from "../../sparnatural/querypreloading/QueryAdapterFunc";
import { findUnit, toSI, unitsOfKinds } from "../../sparnatural/semantic/quantity/QudtUnits";
import { QUANTITY_KIND, QUDT, UNIT } from "../../sparnatural/semantic/SemanticVocabulary";
import { buildSpecProvider, loadData, oneCriteriaQuery, run, toSparql } from "./SemanticTestUtils";

jest.setTimeout(60000);

const quantityFilter = (operator: string, value: number, unit: string, value2?: number): LabelledFilter => ({
  type: "labelledFilter",
  label: operator,
  filter: { type: "quantityFilter", operator, value, unit: UNIT + unit, ...(value2 !== undefined ? { value2 } : {}) },
});

/**
 * The store with, for the endpoint mode, the QUDT description of the temperature units,
 * taken from the bundled table
 */
function storeWithUnits(): Store {
  const store = loadData();
  const { namedNode, literal, quad } = DataFactory;
  const xsdDouble = namedNode("http://www.w3.org/2001/XMLSchema#double");
  for (const name of ["K", "DEG_C", "DEG_F", "M"]) {
    const u = findUnit(UNIT + name)!;
    store.addQuad(quad(namedNode(u.iri), namedNode(QUDT + "conversionMultiplier"), literal(String(u.multiplier), xsdDouble)));
    if (u.offset) store.addQuad(quad(namedNode(u.iri), namedNode(QUDT + "conversionOffset"), literal(String(u.offset), xsdDouble)));
    u.quantityKinds.forEach((k) => store.addQuad(quad(namedNode(u.iri), namedNode(QUDT + "hasQuantityKind"), namedNode(k))));
  }
  return store;
}

describe("QUDT widget", () => {
  let spec: any;
  const store = storeWithUnits();
  beforeAll(async () => {
    spec = await buildSpecProvider();
  });
  const mass = (...filters: LabelledFilter[]) =>
    toSparql(spec, oneCriteriaQuery("Sample", "Sample_mass", QUANTITY_PATTERN.specialEntity, filters));
  const temperature = (...filters: LabelledFilter[]) =>
    toSparql(spec, oneCriteriaQuery("Sample", "Sample_storageTemperature", QUANTITY_PATTERN.specialEntity, filters));

  test("the unit table follows the QUDT 3 conversion convention", () => {
    expect(toSI(0, findUnit(UNIT + "DEG_F")!)).toBeCloseTo(255.372222, 5);
    expect(toSI(-20, findUnit(UNIT + "DEG_C")!)).toBeCloseTo(253.15, 9);
    expect(toSI(5, findUnit(UNIT + "LB")!)).toBeCloseTo(2.26796185, 9);
    const massUnits = unitsOfKinds([QUANTITY_KIND + "Mass"]).map((u) => u.iri);
    expect(massUnits).toEqual(expect.arrayContaining([UNIT + "KiloGM", UNIT + "GM", UNIT + "LB", UNIT + "TONNE", UNIT + "MilliGM"]));
    expect(massUnits).not.toContain(UNIT + "M");
  });

  // expected results in dev-page/configs/semantic-widgets/README.md
  test("mass >= 2 kg, converted on the client side", async () => {
    expect((await run(store, mass(quantityFilter(">=", 2, "KiloGM")))).s).toEqual(["sampleA", "sampleC", "sampleD", "sampleF", "sampleG"]);
  });

  test("mass = 2 kg, within the tolerance", async () => {
    expect((await run(store, mass(quantityFilter("=", 2, "KiloGM")))).s).toEqual(["sampleF", "sampleG"]);
  });

  test("the same criteria written in another unit gives the same results", async () => {
    expect((await run(store, mass(quantityFilter(">=", 2000, "GM")))).s).toEqual(["sampleA", "sampleC", "sampleD", "sampleF", "sampleG"]);
  });

  test("between, and other operators", async () => {
    expect((await run(store, mass(quantityFilter("between", 1, "KiloGM", 2.5)))).s).toEqual(["sampleA", "sampleB", "sampleC", "sampleE", "sampleF", "sampleG"]); // inclusive: sampleA is 2.5 kg
    expect((await run(store, mass(quantityFilter("<", 2, "KiloGM")))).s).toEqual(["sampleB", "sampleE"]);
    expect((await run(store, mass(quantityFilter("!=", 2, "KiloGM")))).s).toEqual(["sampleA", "sampleB", "sampleC", "sampleD", "sampleE"]);
  });

  test("a mass in metres never matches", async () => {
    for (const op of ["<", ">", "!="]) {
      expect((await run(store, mass(quantityFilter(op, 2, "KiloGM")))).s).not.toContain("sampleH");
    }
  });

  test("the selected mass is shown in the default unit", async () => {
    const { rows } = await run(store, mass(quantityFilter(">=", 2, "KiloGM")));
    const bySample = Object.fromEntries(rows.map((r) => [r.s, Number(r.o)]));
    expect(bySample["sampleA"]).toBeCloseTo(2.5, 9);
    expect(bySample["sampleC"]).toBeCloseTo(2.26796185, 9);
    expect(bySample["sampleD"]).toBeCloseTo(3, 9);
  });

  test("without criteria, the selected mass is shown in the default unit too", async () => {
    const { rows } = await run(store, mass());
    const bySample = Object.fromEntries(rows.map((r) => [r.s, r.o]));
    expect(Number(bySample["sampleE"])).toBeCloseTo(1.8, 9);
    // unit of another kind: no value, but the sample is there
    expect(Object.keys(bySample)).toContain("sampleH");
    expect(bySample["sampleH"]).toBeUndefined();
  });

  test("storage temperature <= -18 °C, converted with the units of the endpoint", async () => {
    const sparql = temperature(quantityFilter("<=", -18, "DEG_C"));
    expect(sparql).toContain("conversionMultiplier");
    expect(sparql).not.toContain("VALUES (?o_unit");
    expect((await run(store, sparql)).s).toEqual(["sampleA", "sampleD", "sampleE"]);
  });

  test("the selected temperature is shown in °C", async () => {
    const { rows } = await run(store, temperature(quantityFilter("<=", -18, "DEG_C")));
    const bySample = Object.fromEntries(rows.map((r) => [r.s, Number(r.o)]));
    expect(bySample["sampleD"]).toBeCloseTo(-20, 9);
  });

  test("an invalid criteria matches nothing", async () => {
    expect((await run(store, mass(quantityFilter(">=", 2, "NOT_A_UNIT")))).s).toEqual([]);
    expect((await run(store, mass(quantityFilter("between", 3, "KiloGM", 2)))).s).toEqual([]);
  });

  test("the criteria survives a round trip through the v13 JSON", () => {
    const criteria: QuantityCriteria = { quantityOperator: "between", value: 1, value2: 2, unit: UNIT + "KiloGM" };
    const filters = labelledCriteriaToFilters([{ label: "between", criteria }]);
    expect(filters[0].filter.type).toBe("quantityFilter");
    expect(translateFilters(filters)[0].criteria).toEqual(criteria);
  });
});
