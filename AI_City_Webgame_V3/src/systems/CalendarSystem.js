import { CALENDAR, TIME } from '../core/Constants.js';

const START_TIME = Date.UTC(
  CALENDAR.START_YEAR,
  CALENDAR.START_MONTH - 1,
  CALENDAR.START_DAY,
  CALENDAR.START_HOUR,
);

export function calendarAtElapsedHour(elapsedGameHours) {
  if (!Number.isFinite(elapsedGameHours) || elapsedGameHours < 0) {
    throw new Error(`Invalid elapsed game hours: ${elapsedGameHours}`);
  }
  const date = new Date(START_TIME + elapsedGameHours * CALENDAR.MS_PER_GAME_HOUR);
  return Object.freeze({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    elapsedGameHours,
  });
}

export function formatCalendar(snapshot) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${snapshot.year}-${pad(snapshot.month)}-${pad(snapshot.day)} ${pad(snapshot.hour)}:${pad(snapshot.minute || 0)}`;
}

export function formatCalendarDate(snapshot) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${snapshot.year}-${pad(snapshot.month)}-${pad(snapshot.day)}`;
}

export function intervalForTimeScale(timeScale) {
  if (!TIME.ALLOWED_SCALES.includes(timeScale)) throw new Error(`Unsupported time scale: ${timeScale}`);
  return timeScale === 0 ? null : TIME.BASE_HOUR_MS / timeScale;
}
