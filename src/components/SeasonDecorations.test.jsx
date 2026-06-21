import { describe, expect, it } from 'vitest';
import { getHolidayDecoration } from './SeasonDecorations.jsx';

describe('getHolidayDecoration', () => {
  it('returns fireworks for independence day', () => {
    const holiday = getHolidayDecoration(new Date('2026-07-04T12:00:00Z'));
    expect(holiday).toMatchObject({
      key: 'independence-day',
      label: 'Independence Day',
      mode: 'burst',
    });
  });

  it('returns thanksgiving on the fourth thursday of november', () => {
    const holiday = getHolidayDecoration(new Date('2026-11-26T12:00:00Z'));
    expect(holiday).toMatchObject({
      key: 'thanksgiving',
      label: 'Thanksgiving',
    });
  });

  it('returns null on ordinary days', () => {
    expect(getHolidayDecoration(new Date('2026-02-03T12:00:00Z'))).toBeNull();
  });
});
