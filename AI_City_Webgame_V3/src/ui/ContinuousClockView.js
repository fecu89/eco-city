import { calendarAtElapsedHour, formatCalendarDate } from '../systems/CalendarSystem.js';

export function createContinuousClockView({
  timeElement,
  getElapsedHours,
  getProgress,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
}) {
  let frameId = null;
  let running = false;
  let lastLabel = '';

  const render = () => {
    const visualElapsedHours = Math.max(0, getElapsedHours() + getProgress());
    const snapshot = calendarAtElapsedHour(visualElapsedHours);
    const label = formatCalendarDate(snapshot);
    if (label !== lastLabel) {
      timeElement.textContent = label;
      lastLabel = label;
    }
    return { visualElapsedHours, snapshot, label };
  };

  const loop = () => {
    if (!running) return;
    render();
    frameId = requestFrame(loop);
  };

  return {
    start() {
      if (running) return;
      running = true;
      render();
      frameId = requestFrame(loop);
    },
    stop() {
      running = false;
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
    },
    renderNow: render,
  };
}
