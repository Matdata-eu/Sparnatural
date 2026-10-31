import { Config } from "../../sparnatural/ontologies/SparnaturalConfig";
import { GEOSPARQL_PATTERN, OWL_TIME_PATTERN, QUANTITY_PATTERN } from "../../sparnatural/semantic/SemanticPatterns";
import { buildSpecProvider, CONFIG_NS, loadData, oneCriteriaQuery, run, toSparql } from "./SemanticTestUtils";

jest.setTimeout(30000);

describe("semantic widgets foundation", () => {
  let spec: any;
  beforeAll(async () => {
    spec = await buildSpecProvider();
  });

  test.each([
    ["Event_tookPlace", OWL_TIME_PATTERN.specialEntity, Config.OWL_TIME_PROPERTY],
    ["Place_hasGeometry", GEOSPARQL_PATTERN.specialEntity, Config.GEOSPARQL_PROPERTY],
    ["Sample_mass", QUANTITY_PATTERN.specialEntity, Config.QUANTITY_PROPERTY],
    ["Sample_storageTemperature", QUANTITY_PATTERN.specialEntity, Config.QUANTITY_PROPERTY],
  ])("%s ranges over the special entity of its pattern, with its widget", (shape, entity, widget) => {
    const property = spec.getProperty(CONFIG_NS + shape);
    expect(property.getRange()).toEqual([entity]);
    expect(property.getPropertyType(entity)).toBe(widget);
    expect(spec.getEntity(entity).isLiteralEntity()).toBe(true);
  });

  test("a NodeShape on the class keeps the regular behaviour", async () => {
    const ttl = `
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix time: <http://www.w3.org/2006/time#> .
      @prefix this: <${CONFIG_NS}> .
      this:Event a sh:NodeShape ; sh:targetClass <http://ex/Event> ; sh:property this:Event_time .
      this:Event_time sh:path <http://ex/time> ; sh:class time:Instant .
      this:Instant a sh:NodeShape ; sh:targetClass time:Instant ; sh:property this:Instant_date .
      this:Instant_date sh:path time:inXSDDate ; sh:datatype <http://www.w3.org/2001/XMLSchema#date> .`;
    const own = await buildSpecProvider(ttl);
    expect(own.getProperty(CONFIG_NS + "Event_time").getRange()).toEqual([CONFIG_NS + "Instant"]);
  });

  test("selecting the time variable returns the literal, not the node", async () => {
    const sparql = toSparql(spec, oneCriteriaQuery("Event", "Event_tookPlace", OWL_TIME_PATTERN.specialEntity));
    expect(sparql).toContain("?o_node");
    const { rows } = await run(loadData(), sparql);
    const byEvent = Object.fromEntries(rows.map((r) => [r.s, r.o]));
    expect(byEvent["treatySigned"]).toBe("2020-03-15");
    expect(byEvent["coronation"]).toBe("2020");
    // interval: begin/end, as an ISO 8601 interval
    expect(byEvent["winterFestival"]).toBe("2019-11-01/2020-02-29");
    // no supported value: the event is still there, without a value
    expect(Object.keys(byEvent)).toContain("iceAgePeak");
    expect(byEvent["iceAgePeak"]).toBeUndefined();
    // no time at all: not there, as with any other required criteria
    expect(Object.keys(byEvent)).not.toContain("undatedGathering");
  });

  test("selecting the geometry variable returns the WKT", async () => {
    const sparql = toSparql(spec, oneCriteriaQuery("Place", "Place_hasGeometry", GEOSPARQL_PATTERN.specialEntity));
    const { rows } = await run(loadData(), sparql);
    expect(rows.find((r) => r.s === "grandPlace")?.o).toBe("POINT(4.3522 50.8467)");
  });

  test("selecting the quantity variable returns the number, through qudt:Quantity too, in the default unit", async () => {
    const sparql = toSparql(spec, oneCriteriaQuery("Sample", "Sample_mass", QUANTITY_PATTERN.specialEntity));
    const { rows } = await run(loadData(), sparql);
    const bySample = Object.fromEntries(rows.map((r) => [r.s, r.o]));
    // converted to the default unit of the property, kg
    expect(bySample["sampleA"]).toBe("2.5");
    expect(bySample["sampleE"]).toBe("1.8");
    expect(bySample["sampleD"]).toBe("3");
  });
});
