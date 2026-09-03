import { test, expect } from '@playwright/test';
import {
  calendarAtElapsedDay,
  formatCalendar,
  formatCalendarDate,
  intervalForTimeScale,
} from '../../../src/systems/CalendarSystem.js';
import { createSimulationController } from '../../../src/systems/SimulationSystem.js';

// 1틱 = 1게임일로 정리되며 달력에서 시(hour)·분(minute)이 사라졌다. 하루 안의 소수점 진행은
// 날짜를 바꾸지 않고, 윤년 규칙은 그대로 남는다(2040년은 366일).
test('calendar starts at 2040-01-01 and uses leap-year rules', () => {
  expect(formatCalendar(calendarAtElapsedDay(0))).toBe('2040-01-01');
  expect(calendarAtElapsedDay(0.5)).toMatchObject({ year: 2040, month: 1, day: 1 });
  expect(formatCalendar(calendarAtElapsedDay(0.5))).toBe('2040-01-01');
  expect(formatCalendar(calendarAtElapsedDay(59))).toBe('2040-02-29');
  expect(formatCalendar(calendarAtElapsedDay(60))).toBe('2040-03-01');
  expect(formatCalendar(calendarAtElapsedDay(366))).toBe('2041-01-01');
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
