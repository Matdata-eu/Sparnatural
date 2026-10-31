import { TimeCriteria } from "../../SparnaturalQueryIfc";

export type TimeGranularity = TimeCriteria["granularity"];

/**
 * A moment of the proleptic Gregorian calendar, in UTC, at minute precision.
 * Years are astronomical, like in XSD 1.1: year 0 is 1 BC, -752 is 753 BC.
 * JavaScript Dates are not used on purpose: they shift 2-digit years to the 1900s
 * and apply the local timezone.
 */
export interface Moment {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
}

export type CalendarUnit = "year" | "month" | "day" | "minute";

const PATTERNS: { [g in TimeGranularity]: RegExp } = {
  year: /^(-?\d{1,6})$/,
  month: /^(-?\d{1,6})-(\d{2})$/,
  day: /^(-?\d{1,6})-(\d{2})-(\d{2})$/,
  minute: /^(-?\d{1,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2}(\.\d+)?)?$/,
};

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * @returns the start of the period written in the given granularity, e.g. "2020-03"
 * at month granularity is 2020-03-01T00:00, or undefined if the value is not valid
 */
export function parseMoment(value: string, granularity: TimeGranularity): Moment | undefined {
  const m = PATTERNS[granularity]?.exec((value ?? "").trim());
  if (!m) return undefined;
  const moment: Moment = {
    year: parseInt(m[1], 10),
    month: m[2] ? parseInt(m[2], 10) : 1,
    day: m[3] ? parseInt(m[3], 10) : 1,
    hour: m[4] ? parseInt(m[4], 10) : 0,
    minute: m[5] ? parseInt(m[5], 10) : 0,
  };
  if (moment.month < 1 || moment.month > 12) return undefined;
  if (moment.day < 1 || moment.day > daysInMonth(moment.year, moment.month)) return undefined;
  if (moment.hour > 23 || moment.minute > 59) return undefined;
  return moment;
}

/**
 * Adds n units (n may be negative). When the day does not exist in the target month
 * (Mar 31 minus one month), it is clamped to the last day of that month.
 */
export function addUnit(m: Moment, unit: CalendarUnit, n: number): Moment {
  let { year, month, day, hour, minute } = m;
  switch (unit) {
    case "year":
      year += n;
      break;
    case "month": {
      const total = year * 12 + (month - 1) + n;
      year = Math.floor(total / 12);
      month = total - year * 12 + 1;
      break;
    }
    case "day": {
      // step day by day: n is always small here
      const step = n < 0 ? -1 : 1;
      for (let i = 0; i < Math.abs(n); i++) {
        day += step;
        if (day < 1) {
          ({ year, month } = addUnit({ year, month, day: 1, hour, minute }, "month", -1));
          day = daysInMonth(year, month);
        } else if (day > daysInMonth(year, month)) {
          ({ year, month } = addUnit({ year, month, day: 1, hour, minute }, "month", 1));
          day = 1;
        }
      }
      return { year, month, day, hour, minute };
    }
    case "minute": {
      let total = hour * 60 + minute + n;
      const days = Math.floor(total / 1440);
      total -= days * 1440;
      const d = addUnit({ year, month, day, hour: 0, minute: 0 }, "day", days);
      return { ...d, hour: Math.floor(total / 60), minute: total % 60 };
    }
  }
  return { year, month, day: Math.min(day, daysInMonth(year, month)), hour, minute };
}

const pad = (n: number, width: number) => String(Math.abs(n)).padStart(width, "0");

/**
 * @returns the xsd:dateTime lexical form, in UTC, e.g. "-0752-01-01T00:00:00Z"
 */
export function toXsdDateTime(m: Moment): string {
  const year = (m.year < 0 ? "-" : "") + pad(m.year, 4);
  return `${year}-${pad(m.month, 2)}-${pad(m.day, 2)}T${pad(m.hour, 2)}:${pad(m.minute, 2)}:00Z`;
}

export function compareMoments(a: Moment, b: Moment): number {
  return (
    a.year - b.year ||
    a.month - b.month ||
    a.day - b.day ||
    a.hour - b.hour ||
    a.minute - b.minute
  );
}

/**
 * The reference period of a time criteria, as a half-open interval [begin, end).
 */
export interface ReferencePeriod {
  begin: Moment;
  end: Moment;
}

/**
 * @returns the reference period: from the start of "start" to the end of "stop" (or of
 * "start"), or undefined when a bound is not valid or the period ends before it begins
 */
export function referencePeriod(criteria: TimeCriteria): ReferencePeriod | undefined {
  const begin = parseMoment(criteria.start, criteria.granularity);
  const last = criteria.stop
    ? parseMoment(criteria.stop, criteria.granularity)
    : begin;
  if (!begin || !last) return undefined;
  const end = addUnit(last, criteria.granularity, 1);
  if (compareMoments(begin, end) >= 0) return undefined;
  return { begin, end };
}
