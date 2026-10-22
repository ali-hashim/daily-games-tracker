const pacificCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificDay(now = new Date()): string {
  const values = Object.fromEntries(
    pacificCalendar.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function previousCalendarDay(isoDay: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    throw new TypeError("Expected a YYYY-MM-DD day");
  }

  const date = new Date(`${isoDay}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDay) {
    throw new RangeError("Invalid calendar day");
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
