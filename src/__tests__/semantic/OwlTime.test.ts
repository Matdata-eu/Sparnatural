import { OWL_TIME_PATTERN } from "../../sparnatural/semantic/SemanticPatterns";
import { TIME_RELATIONS } from "../../sparnatural/semantic/time/TimeRelations";
import { TimeCriteria } from "../../sparnatural/SparnaturalQueryIfc";
import { LabelledFilter } from "../../sparnatural/SparnaturalQueryIfc-v13";
import { labelledCriteriaToFilters, translateFilters } from "../../sparnatural/querypreloading/QueryAdapterFunc";
import { buildSpecProvider, loadData, oneCriteriaQuery, run, toSparql } from "./SemanticTestUtils";

jest.setTimeout(60000);

const timeFilter = (relation: string, start: string, stop?: string, granularity: TimeCriteria["granularity"] = "year"): LabelledFilter => ({
  type: "labelledFilter",
  label: relation,
  filter: { type: "timeFilter", relation, granularity, start, ...(stop ? { stop } : {}) },
});

const WITHIN = [
  "coronation", "culturalCapitalYear", "europeDay", "firstBroadcast", "harbourOpening",
  "marchCampaign", "springSeason", "summerSchool", "treatySigned",
];

// expected results in dev-page/configs/semantic-widgets/README.md, reference period: 2020
const EXPECTED: { [relation: string]: string[] } = {
  within: WITHIN,
  intersects: [...WITHIN, "renovationCampaign", "restorationProject", "touringExhibition", "winterFestival"],
  before: ["decadeReview", "foundationOfRome", "satelliteLaunch"],
  after: ["censusDay"],
  intervalBefore: ["foundationOfRome", "satelliteLaunch"],
  intervalMeets: ["decadeReview"],
  intervalMetBy: ["censusDay"],
  intervalAfter: [],
  intervalOverlaps: ["winterFestival"],
  intervalOverlappedBy: ["touringExhibition"],
  intervalStarts: ["springSeason"],
  intervalStartedBy: [],
  intervalDuring: ["europeDay", "firstBroadcast", "marchCampaign", "summerSchool", "treatySigned"],
  intervalContains: ["renovationCampaign", "restorationProject"],
  intervalFinishes: ["harbourOpening"],
  intervalFinishedBy: [],
  intervalEquals: ["coronation", "culturalCapitalYear"],
  intervalIn: ["europeDay", "firstBroadcast", "harbourOpening", "marchCampaign", "springSeason", "summerSchool", "treatySigned"],
  intervalDisjoint: ["censusDay", "decadeReview", "foundationOfRome", "satelliteLaunch"],
};

describe("OWL-Time widget", () => {
  let spec: any;
  const store = loadData();
  beforeAll(async () => {
    spec = await buildSpecProvider();
  });

  const query = (...filters: LabelledFilter[]) =>
    toSparql(spec, oneCriteriaQuery("Event", "Event_tookPlace", OWL_TIME_PATTERN.specialEntity, filters));

  test("every relation has an expected result", () => {
    expect(TIME_RELATIONS.map((r) => r.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  // Comunica 4 casts BC dates but cannot compare them, so foundationOfRome (-0752) is
  // left out here; the bounds written for it are checked in TimeReference.test.ts
  const COMPARABLE = (events: string[]) => events.filter((e) => e !== "foundationOfRome");

  test.each(Object.entries(EXPECTED))("%s 2020", async (relation, expected) => {
    const { s } = await run(store, query(timeFilter(relation, "2020")));
    expect(s).toEqual(COMPARABLE([...expected].sort()));
  });

  test("the same period written at another granularity gives the same results", async () => {
    for (const relation of ["within", "intervalEquals", "intervalMeets", "intervalContains"]) {
      const byYear = (await run(store, query(timeFilter(relation, "2020")))).s;
      const byMonth = (await run(store, query(timeFilter(relation, "2020-01", "2020-12", "month")))).s;
      const byDay = (await run(store, query(timeFilter(relation, "2020-01-01", "2020-12-31", "day")))).s;
      expect(byMonth).toEqual(byYear);
      expect(byDay).toEqual(byYear);
    }
  });

  test("a month reference", async () => {
    // March 2020: the marchCampaign description, treatySigned on the 15th, springSeason from March 1st
    const { s } = await run(store, query(timeFilter("intervalEquals", "2020-03", undefined, "month")));
    expect(s).toEqual(["marchCampaign"]);
  });

  test("a minute reference around a dateTime instant", async () => {
    const { s } = await run(store, query(timeFilter("within", "2019-12-31T23:00", "2019-12-31T23:59", "minute")));
    expect(s).toEqual(["satelliteLaunch"]);
  });

  test("several criteria are combined with OR", async () => {
    const { s } = await run(store, query(timeFilter("intervalMeets", "2020"), timeFilter("intervalMetBy", "2020")));
    expect(s).toEqual(["censusDay", "decadeReview"]);
  });

  test("the selected variable shows the instant literal or the interval bounds", async () => {
    const { rows } = await run(store, query(timeFilter("intersects", "2020")));
    const byEvent = Object.fromEntries(rows.map((r) => [r.s, r.o]));
    expect(byEvent["treatySigned"]).toBe("2020-03-15");
    expect(byEvent["europeDay"]).toBe("2020-05-09");
    expect(byEvent["marchCampaign"]).toBe("2020-03");
    expect(byEvent["winterFestival"]).toBe("2019-11-01/2020-02-29");
    expect(byEvent["restorationProject"]).toBe("2018/..");
  });

  test("an invalid criteria matches nothing", async () => {
    const { s } = await run(store, query(timeFilter("within", "2020-13", undefined, "month")));
    expect(s).toEqual([]);
  });

  test("the criteria survives a round trip through the v13 JSON", () => {
    const criteria: TimeCriteria = { timeRelation: "intervalMeets", granularity: "day", start: "2020-01-01", stop: "2020-02-01" };
    const filters = labelledCriteriaToFilters([{ label: "meets", criteria }]);
    expect(filters[0].filter.type).toBe("timeFilter");
    expect(translateFilters(filters)[0].criteria).toEqual(criteria);
  });
});
