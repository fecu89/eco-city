import { calendarAtElapsedDay, formatCalendarDate } from '../systems/CalendarSystem.js';

export function createContinuousClockView({
  timeElement,
  getElapsedDays,
  getProgress,
  onProgress = () => {},
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
}) {
  let frameId = null;
  let running = false;
  let lastLabel = '';

  const render = () => {
    const tickProgress = Math.max(0, Math.min(1, Number(getProgress()) || 0));
    const visualElapsedDays = Math.max(0, getElapsedDays() + tickProgress);
    onProgress(tickProgress);
    const snapshot = calendarAtElapsedDay(visualElapsedDays);
    const label = formatCalendarDate(snapshot);
    if (label !== lastLabel) {
      timeElement.textContent = label;
      lastLabel = label;
    }
    return { visualElapsedDays, snapshot, label };
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
