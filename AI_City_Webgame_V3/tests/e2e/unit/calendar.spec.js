import { test, expect } from '@playwright/test';
import {
  calendarAtElapsedDay,
  formatCalendar,
  formatCalendarDate,
  intervalForTimeScale,
} from '../../../src/systems/CalendarSystem.js';
import { createSimulationController } from '../../../src/systems/SimulationSystem.js';

test('calendar starts at 2040-01-01 08:00 and uses leap-year rules', () => {
  expect(formatCalendar(calendarAtElapsedDay(0))).toBe('2040-01-01 08:00');
  expect(calendarAtElapsedDay(0.5)).toMatchObject({ hour: 8, minute: 30 });
  expect(formatCalendar(calendarAtElapsedDay(0.5))).toBe('2040-01-01 08:30');
  expect(formatCalendar(calendarAtElapsedDay(24 * 59 + 16))).toBe('2040-03-01 00:00');
  expect(formatCalendar(calendarAtElapsedDay(24 * 365 + 16))).toBe('2041-01-01 00:00');
  expect(formatCalendarDate(calendarAtElapsedDay(0.5))).toBe('2040-01-01');
});

test('supported speeds resolve to exact real-time intervals', () => {
  expect(intervalForTimeScale(0)).toBeNull();
  expect(intervalForTimeScale(1)).toBe(1000);
  expect(intervalForTimeScale(2)).toBe(500);
  expect(intervalForTimeScale(4)).toBe(250);
  expect(() => intervalForTimeScale(3)).toThrow(/time scale/i);
});

test('changing speed cancels one timer and reschedules without settling twice', () => {
  let now = 0;
  let settles = 0;
  let nextId = 0;
  const timers = new Map();
  const controller = createSimulationController({
    settle: () => { settles += 1; },
    getIntervalMs: (speed) => intervalForTimeScale(speed),
    setTimer: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay, startedAt: now }); return id; },
    clearTimer: (id) => timers.delete(id),
    now: () => now,
  });
  controller.start();
  expect([...timers.values()][0].delay).toBe(1000);
  now = 400;
  controller.setTimeScale(4);
  expect(timers.size).toBe(1);
  expect([...timers.values()][0].delay).toBe(150);
  [...timers.values()][0].fn();
  expect(settles).toBe(1);
});

test('pause and resume preserve fractional settlement progress', () => {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const controller = createSimulationController({
    settle: () => {},
    getIntervalMs: intervalForTimeScale,
    setTimer: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    now: () => now,
  });
  controller.start();
  now = 400;
  controller.pause('modal');
  expect(controller.getProgress()).toBeCloseTo(0.4);
  now = 900;
  expect(controller.getProgress()).toBeCloseTo(0.4);
  controller.resume('modal');
  expect([...timers.values()][0].delay).toBeCloseTo(600);
});
