import React, { useMemo } from 'react';

const getSeason = (date = new Date()) => {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return 'winter';
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  return 'autumn';
};

const isFourthThursdayOfNovember = (date) => {
  if (date.getMonth() !== 10) return false;
  if (date.getDay() !== 4) return false;
  return date.getDate() >= 22 && date.getDate() <= 28;
};

export const getHolidayDecoration = (date = new Date()) => {
  const month = date.getMonth();
  const day = date.getDate();

  if (month === 0 && day === 1) {
    return { key: 'new-year', label: 'New Year', theme: 'new-year', icon: '✦', count: 16, mode: 'burst' };
  }
  if (month === 1 && day === 14) {
    return { key: 'valentines', label: "Valentine's Day", theme: 'valentines', icon: '♥', count: 14, mode: 'float' };
  }
  if (month === 3 && day === 1) {
    return { key: 'april-fools', label: 'April Fools', theme: 'april-fools', icon: '✶', count: 12, mode: 'float' };
  }
  if (month === 6 && day === 4) {
    return { key: 'independence-day', label: 'Independence Day', theme: 'independence-day', icon: '🎆', count: 18, mode: 'burst' };
  }
  if (month === 9 && day === 31) {
    return { key: 'halloween', label: 'Halloween', theme: 'halloween', icon: '🎃', count: 16, mode: 'float' };
  }
  if (month === 10 && isFourthThursdayOfNovember(date)) {
    return { key: 'thanksgiving', label: 'Thanksgiving', theme: 'thanksgiving', icon: '🍂', count: 14, mode: 'float' };
  }
  if (month === 11 && (day === 24 || day === 25)) {
    return { key: 'holiday', label: 'Holiday', theme: 'holiday', icon: '✦', count: 18, mode: 'float' };
  }

  return null;
};

const DECORATION_MAP = {
  winter: { icon: '❄', count: 16, label: 'Winter' },
  spring: { icon: '✿', count: 14, label: 'Spring' },
  summer: { icon: '✦', count: 12, label: 'Summer' },
  autumn: { icon: '❋', count: 14, label: 'Autumn' },
};

export default function SeasonDecorations({ density = 100 }) {
  const now = new Date();
  const season = getSeason(now);
  const holiday = getHolidayDecoration(now);
  const config = DECORATION_MAP[season];
  const itemCount = Math.max(4, Math.round((config.count * density) / 100));
  const items = useMemo(
    () => Array.from({ length: itemCount }, (_, index) => ({
      id: `${season}-${index}`,
      left: `${(index * 97) % 100}%`,
      delay: `${(index % 7) * 0.8}s`,
      duration: `${8 + (index % 5) * 1.4}s`,
      scale: 0.7 + (index % 4) * 0.14,
      drift: `${((index % 5) - 2) * 22}px`,
    })),
    [itemCount, season]
  );

  const holidayItemCount = holiday ? Math.max(6, Math.round((holiday.count * density) / 100)) : 0;
  const holidayItems = useMemo(
    () => (holiday
      ? Array.from({ length: holidayItemCount }, (_, index) => ({
        id: `${holiday.key}-${index}`,
        left: `${((index * 13) + (index % 4) * 11) % 100}%`,
        top: `${(10 + (index % 6) * 12)}%`,
        delay: `${(index % 8) * 0.25}s`,
        duration: `${2.8 + (index % 4) * 0.35}s`,
        scale: 0.8 + (index % 3) * 0.18,
        drift: `${((index % 5) - 2) * 30}px`,
      }))
      : []),
    [holiday, holidayItemCount]
  );

  return (
    <>
      <div className={`season-decor season-decor--${season}`} aria-hidden="true" data-season={config.label}>
        {items.map((item) => (
          <span
            key={item.id}
            className="season-decor__item"
            style={{
              left: item.left,
              animationDelay: item.delay,
              animationDuration: item.duration,
              '--season-scale': item.scale,
              '--season-drift': item.drift,
            }}
          >
            {config.icon}
          </span>
        ))}
      </div>

      {holiday && (
        <div className={`season-decor season-decor--holiday season-decor--${holiday.theme}`} aria-hidden="true" data-holiday={holiday.label}>
          {holidayItems.map((item) => (
            <span
              key={item.id}
              className={`season-decor__item season-decor__item--${holiday.mode}`}
              style={{
                left: item.left,
                top: item.top,
                animationDelay: item.delay,
                animationDuration: item.duration,
                '--season-scale': item.scale,
                '--season-drift': item.drift,
              }}
            >
              {holiday.icon}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
