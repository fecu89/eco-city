import { CALENDAR, TIME } from '../core/Constants.js';

const START_TIME = Date.UTC(
  CALENDAR.START_YEAR,
  CALENDAR.START_MONTH - 1,
  CALENDAR.START_DAY,
);

export function calendarAtElapsedDay(elapsedGameDays) {
  if (!Number.isFinite(elapsedGameDays) || elapsedGameDays < 0) {
    throw new Error(`Invalid elapsed game days: ${elapsedGameDays}`);
  }
  const date = new Date(START_TIME + elapsedGameDays * CALENDAR.MS_PER_GAME_DAY);
  return Object.freeze({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    elapsedGameDays,
  });
}

export function formatCalendar(snapshot) {
  return formatCalendarDate(snapshot);
}

export function formatCalendarDate(snapshot) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${snapshot.year}-${pad(snapshot.month)}-${pad(snapshot.day)}`;
}

export function intervalForTimeScale(timeScale) {
  if (!TIME.ALLOWED_SCALES.includes(timeScale)) throw new Error(`Unsupported time scale: ${timeScale}`);
  return timeScale === 0 ? null : TIME.BASE_DAY_MS / timeScale;
}
