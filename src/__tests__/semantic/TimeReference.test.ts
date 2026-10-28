import { addUnit, parseMoment, referencePeriod, toXsdDateTime } from "../../sparnatural/semantic/time/TimeReference";

const xsd = (s: string, g: any) => toXsdDateTime(parseMoment(s, g)!);

describe("time reference periods", () => {
  test("a period runs from the start of its first unit to the start of the unit after its last", () => {
    const p = referencePeriod({ timeRelation: "within", granularity: "month", start: "2020-01", stop: "2020-02" })!;
    expect(toXsdDateTime(p.begin)).toBe("2020-01-01T00:00:00Z");
    expect(toXsdDateTime(p.end)).toBe("2020-03-01T00:00:00Z");
  });

  test("BC years are astronomical and written with at least 4 digits", () => {
    const p = referencePeriod({ timeRelation: "within", granularity: "year", start: "-752" })!;
    expect(toXsdDateTime(p.begin)).toBe("-0752-01-01T00:00:00Z");
    expect(toXsdDateTime(p.end)).toBe("-0751-01-01T00:00:00Z");
    expect(toXsdDateTime(addUnit(parseMoment("0", "year")!, "year", -1))).toBe("-0001-01-01T00:00:00Z");
  });

  test("two-digit years stay in the first century", () => {
    expect(xsd("50", "year")).toBe("0050-01-01T00:00:00Z");
  });

  test.each([
    ["2020-03-01", "day", -1, "2020-02-29T00:00:00Z"],
    ["2019-03-01", "day", -1, "2019-02-28T00:00:00Z"],
    ["2020-01-01", "day", -1, "2019-12-31T00:00:00Z"],
    ["2020-01-01", "month", -1, "2019-12-01T00:00:00Z"],
    ["2020-03-31", "month", -1, "2020-02-29T00:00:00Z"],
    ["2020-02-29", "year", 1, "2021-02-28T00:00:00Z"],
    ["1900-02-28", "day", 1, "1900-03-01T00:00:00Z"],
  ])("%s %s %d", (start, unit, n, expected) => {
    expect(toXsdDateTime(addUnit(parseMoment(start, "day")!, unit as any, n))).toBe(expected);
  });

  test("minutes roll over days", () => {
    expect(toXsdDateTime(addUnit(parseMoment("2019-12-31T23:59", "minute")!, "minute", 1))).toBe("2020-01-01T00:00:00Z");
  });

  test.each([
    ["2020-13", "month"],
    ["2019-02-29", "day"],
    ["20-20", "year"],
    ["2020-01-01T24:00", "minute"],
  ])("%s is not a valid %s", (value, g) => {
    expect(parseMoment(value, g as any)).toBeUndefined();
  });

  test("a period that ends before it begins is invalid", () => {
    expect(referencePeriod({ timeRelation: "within", granularity: "year", start: "2021", stop: "2020" })).toBeUndefined();
  });
});
