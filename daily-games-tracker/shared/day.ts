import { KRILLION_DATE_ANCHOR, KRILLION_SUPPORTED_PUZZLE_RANGE } from "./game-config";

const pacificCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseCalendarDay(isoDay: string): Date {
  if (!ISO_DAY.test(isoDay)) {
    throw new TypeError("Expected a YYYY-MM-DD day");
  }

  const date = new Date(`${isoDay}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDay) {
    throw new RangeError("Invalid calendar day");
  }
  return date;
}

function formatCalendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) {
    return false;
  }
  if (month === 2 && day === 29) return true;
  return day <= [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function pacificDay(now = new Date()): string {
  const values = Object.fromEntries(
    pacificCalendar.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function previousCalendarDay(isoDay: string): string {
  const date = parseCalendarDay(isoDay);
  date.setUTCDate(date.getUTCDate() - 1);
  return formatCalendarDay(date);
}

export function nextCalendarDay(isoDay: string): string {
  const date = parseCalendarDay(isoDay);
  date.setUTCDate(date.getUTCDate() + 1);
  return formatCalendarDay(date);
}

export interface WorldwideWindow {
  opensAt: Date;
  closesAt: Date;
}

export function worldwideWindow(gameDate: string): WorldwideWindow {
  parseCalendarDay(gameDate);
  return {
    // UTC+14 00:00 is 10:00Z on the previous UTC civil date.
    opensAt: new Date(`${previousCalendarDay(gameDate)}T10:00:00.000Z`),
    // UTC-12 00:00 is 12:00Z on the following UTC civil date.
    closesAt: new Date(`${nextCalendarDay(gameDate)}T12:00:00.000Z`),
  };
}

export function isWorldwideWindowOpen(gameDate: string, now = new Date()): boolean {
  const { opensAt, closesAt } = worldwideWindow(gameDate);
  if (Number.isNaN(now.getTime())) throw new RangeError("Invalid current time");
  return now >= opensAt && now < closesAt;
}

export function latestWorldwideDay(now = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new RangeError("Invalid current time");
  const utcDay = formatCalendarDay(now);
  return now >= new Date(`${utcDay}T10:00:00.000Z`) ? nextCalendarDay(utcDay) : utcDay;
}

export function resolveOpenCalendarDate(month: number, day: number, now: Date): string | null {
  if (!isValidMonthDay(month, day) || Number.isNaN(now.getTime())) return null;
  const currentYear = now.getUTCFullYear();
  const candidates = [currentYear - 1, currentYear, currentYear + 1]
    .map((year) => new Date(Date.UTC(year, month - 1, day, 12)))
    .filter((date) => date.getUTCMonth() === month - 1 && date.getUTCDate() === day)
    .map(formatCalendarDay)
    .filter((gameDate) => isWorldwideWindowOpen(gameDate, now));
  return candidates.length === 1 ? candidates[0] : null;
}

export function krillionDateForPuzzle(puzzleNumber: number): string | null {
  if (
    !Number.isSafeInteger(puzzleNumber) ||
    puzzleNumber < KRILLION_SUPPORTED_PUZZLE_RANGE.min ||
    puzzleNumber > KRILLION_SUPPORTED_PUZZLE_RANGE.max
  )
    return null;
  const date = parseCalendarDay(KRILLION_DATE_ANCHOR.gameDate);
  date.setUTCDate(date.getUTCDate() + puzzleNumber - KRILLION_DATE_ANCHOR.puzzleNumber);
  return Number.isNaN(date.getTime()) ? null : formatCalendarDay(date);
}
