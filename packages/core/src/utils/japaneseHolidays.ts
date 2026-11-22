import { japaneseHolidayDates } from '../data/japaneseHolidayDates';

/** A local calendar date (YYYY-MM-DD), independent of the device time zone. */
export function getJapaneseHoliday(date: string): string | undefined {
  const name = japaneseHolidayDates[date];
  return typeof name === 'string' ? name : undefined;
}

export function withHolidayName(dateLabel: string, holiday: string | undefined): string {
  return holiday ? `${dateLabel}（${holiday}）` : dateLabel;
}
