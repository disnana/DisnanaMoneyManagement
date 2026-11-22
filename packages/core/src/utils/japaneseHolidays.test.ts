import { describe, expect, it } from 'vitest';
import { getJapaneseHoliday, withHolidayName } from './japaneseHolidays';

describe('Japanese calendar dates', () => {
  it.each([
    ['1955-01-01', '元日'],
    ['1987-05-04', '振替休日'],
    ['1988-05-04', '国民の休日'],
    ['2019-04-29', '昭和の日'],
    ['2019-04-30', '国民の休日'],
    ['2019-05-01', '天皇の即位の日'],
    ['2019-05-02', '国民の休日'],
    ['2019-10-22', '即位礼正殿の儀'],
    ['2021-07-22', '海の日'],
    ['2026-05-03', '憲法記念日'],
    ['2026-05-06', '振替休日'],
    ['2026-09-21', '敬老の日'],
    ['2026-09-22', '国民の休日'],
    ['2026-09-23', '秋分の日'],
    ['2026-11-03', '文化の日'],
    ['2026-11-23', '勤労感謝の日'],
    ['2027-01-01', '元日'],
    ['2027-03-21', '春分の日'],
    ['2027-03-22', '振替休日'],
  ])('looks up %s as %s', (day, name) => {
    expect(getJapaneseHoliday(day)).toBe(name);
  });

  it.each(['1954-11-03', '2021-07-19', '2026-05-07', '2026-09-20', '2026-11-22', '2026-12-31', '3000-01-01', 'invalid'])(
    'does not mark an ordinary, unpublished or invalid date (%s)',
    day => expect(getJapaneseHoliday(day)).toBeUndefined(),
  );

  it('adds the holiday name to a date label only when one was published', () => {
    expect(withHolidayName('2026年5月6日', getJapaneseHoliday('2026-05-06'))).toBe('2026年5月6日（振替休日）');
    expect(withHolidayName('2026年5月7日', getJapaneseHoliday('2026-05-07'))).toBe('2026年5月7日');
  });
});
