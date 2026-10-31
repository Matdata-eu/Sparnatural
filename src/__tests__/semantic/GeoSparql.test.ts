import { GEOSPARQL_PATTERN } from "../../sparnatural/semantic/SemanticPatterns";
import { GeoCriteria } from "../../sparnatural/SparnaturalQueryIfc";
import { LabelledFilter } from "../../sparnatural/SparnaturalQueryIfc-v13";
import { labelledCriteriaToFilters, translateFilters } from "../../sparnatural/querypreloading/QueryAdapterFunc";
import { parseWkt, toWkt } from "../../sparnatural/semantic/geo/Wkt";
import { GEO_EXTENSION_FUNCTIONS } from "./GeoTestFunctions";
import { buildSpecProvider, loadData, oneCriteriaQuery, run, toSparql } from "./SemanticTestUtils";

jest.setTimeout(60000);

const PENTAGON = "POLYGON((4.3410 50.8550, 4.3600 50.8590, 4.3720 50.8530, 4.3680 50.8400, 4.3500 50.8350, 4.3380 50.8440, 4.3410 50.8550))";
const BOX = "POLYGON((4.33 50.83, 4.40 50.83, 4.40 50.86, 4.33 50.86, 4.33 50.83))";
const GRAND_PLACE = "POINT(4.3522 50.8467)";

const geoFilter = (relation: string, wkt: string, distance?: number): LabelledFilter => ({
  type: "labelledFilter",
  label: relation,
  filter: { type: "geoFilter", relation, wkt, ...(distance !== undefined ? { distance } : {}) },
});

describe("GeoSPARQL widget", () => {
  let spec: any;
  const store = loadData();
  beforeAll(async () => {
    spec = await buildSpecProvider();
  });
  const query = (...filters: LabelledFilter[]) =>
    toSparql(spec, oneCriteriaQuery("Place", "Place_hasGeometry", GEOSPARQL_PATTERN.specialEntity, filters));
  const places = async (...filters: LabelledFilter[]) =>
    (await run(store, query(...filters), GEO_EXTENSION_FUNCTIONS)).s;

  test("the SPARQL uses the standard functions on the gsp:asWKT literal", () => {
    const sparql = query(geoFilter("sfWithin", PENTAGON));
    expect(sparql).toContain("<http://www.opengis.net/ont/geosparql#asWKT> ?o");
    expect(sparql).toContain(`<http://www.opengis.net/def/function/geosparql/sfWithin>(?o, "${PENTAGON}"^^<http://www.opengis.net/ont/geosparql#wktLiteral>)`);
    const distance = query(geoFilter("withinDistance", GRAND_PLACE, 5000));
    expect(distance).toContain(`<http://www.opengis.net/def/function/geosparql/distance>(?o, "${GRAND_PLACE}"^^<http://www.opengis.net/ont/geosparql#wktLiteral>, <http://www.opengis.net/def/uom/OGC/1.0/metre>)) <= \"5000.0\"^^<http://www.w3.org/2001/XMLSchema#decimal>`);
  });

  // expected results in dev-page/configs/semantic-widgets/README.md
  test("within 5 km of the Grand-Place", async () => {
    expect(await places(geoFilter("withinDistance", GRAND_PLACE, 5000))).toEqual(
      ["boisDeLaCambre", "cinquantenaire", "grandPlace", "midiStation", "northSouthJunction", "parcDuCinquantenaire", "pentagon", "royalPalace"],
    );
  });

  test("within the Pentagon", async () => {
    expect(await places(geoFilter("sfWithin", PENTAGON))).toEqual(["grandPlace", "pentagon", "royalPalace"]);
  });

  test("intersects the Pentagon", async () => {
    expect(await places(geoFilter("sfIntersects", PENTAGON))).toEqual(["grandPlace", "northSouthJunction", "pentagon", "royalPalace"]);
  });

  test("crosses the Pentagon", async () => {
    expect(await places(geoFilter("sfCrosses", PENTAGON))).toEqual(["northSouthJunction"]);
  });

  test("within a box, including a latitude-longitude EPSG:4326 point", async () => {
    expect(await places(geoFilter("sfWithin", BOX))).toEqual(
      ["cinquantenaire", "grandPlace", "midiStation", "northSouthJunction", "parcDuCinquantenaire", "pentagon", "royalPalace"],
    );
  });

  test("the selected variable is the WKT literal", async () => {
    const { rows } = await run(store, query(geoFilter("sfWithin", PENTAGON)), GEO_EXTENSION_FUNCTIONS);
    expect(rows.find((r) => r.s === "grandPlace")?.o).toBe(GRAND_PLACE);
  });

  test("an invalid criteria matches nothing", async () => {
    expect(await places(geoFilter("sfWithin", "not wkt"))).toEqual([]);
    expect(await places(geoFilter("withinDistance", GRAND_PLACE))).toEqual([]);
  });

  test("the criteria survives a round trip through the v13 JSON", () => {
    const criteria: GeoCriteria = { geoRelation: "withinDistance", wkt: GRAND_PLACE, distance: 1500 };
    const filters = labelledCriteriaToFilters([{ label: "near", criteria }]);
    expect(filters[0].filter.type).toBe("geoFilter");
    expect(translateFilters(filters)[0].criteria).toEqual(criteria);
  });

  test("WKT parsing and writing", () => {
    expect(toWkt(parseWkt(PENTAGON)!)).toBe(PENTAGON.replace(/(\d)0+([ ,)])/g, "$1$2"));
    expect(parseWkt("point ( 4.35 50.84 )")).toEqual({ type: "Point", coordinates: [4.35, 50.84] });
    expect(parseWkt("POLYGON((0 0, 1 0, 1 1))")).toBeUndefined(); // not closed
    expect(parseWkt("POINT(200 0)")).toBeUndefined();
    expect(toWkt({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] })).toBe("POLYGON((0 0, 1 0, 1 1, 0 0))");
  });
});
