export const ALL_TIME_WIDE_WINDOW_MIN_WIDTH = 440;

export type AllTimeWindowSize = 4 | 5;

export interface AllTimeDateWindow {
  dates: string[];
  startIndex: number;
  canMoveOlder: boolean;
  canMoveNewer: boolean;
}

export function allTimeWindowSizeForWidth(width: number | undefined): AllTimeWindowSize {
  return width !== undefined && Number.isFinite(width) && width >= ALL_TIME_WIDE_WINDOW_MIN_WIDTH
    ? 5
    : 4;
}

export function createAllTimeDateWindow(
  days: readonly { date: string }[],
  windowSize: AllTimeWindowSize,
  requestedStartIndex: number,
): AllTimeDateWindow {
  if (days.length === 0) {
    return {
      dates: [],
      startIndex: 0,
      canMoveOlder: false,
      canMoveNewer: false,
    };
  }

  const oldestWindowStart = Math.max(
    0,
    Math.ceil(days.length / windowSize) * windowSize - windowSize,
  );
  const clampedStartIndex = Math.min(Math.max(0, requestedStartIndex), oldestWindowStart);
  const lowerBoundary = Math.floor(clampedStartIndex / windowSize) * windowSize;
  const upperBoundary = Math.min(oldestWindowStart, lowerBoundary + windowSize);
  const startIndex =
    clampedStartIndex - lowerBoundary < upperBoundary - clampedStartIndex
      ? lowerBoundary
      : upperBoundary;
  const dates = days.slice(startIndex, startIndex + windowSize).map((day) => day.date);

  return {
    dates,
    startIndex,
    canMoveOlder: startIndex < oldestWindowStart,
    canMoveNewer: startIndex > 0,
  };
}
