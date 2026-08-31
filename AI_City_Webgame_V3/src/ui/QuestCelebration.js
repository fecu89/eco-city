import { UI_FEEDBACK } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { formatCredits } from './format.js';

let root = null;
let hideTimer = null;

export function initQuestCelebration(element) {
  root = element;
  eventBus.on(Events.GAME_RESET, () => {
    clearTimeout(hideTimer);
    root?.classList.remove('show');
    root?.replaceChildren();
  });
  eventBus.on(Events.QUEST_CLAIMED, ({ quest, result }) => {
    if (!root || !quest) return;
    clearTimeout(hideTimer);
    const reward = [result?.credits ? formatCredits(result.credits) : '', result?.unlockedFacility ? '새 시설 해금' : '']
      .filter(Boolean).join(' · ') || '도시 전환 기록 갱신';
    root.innerHTML = `
      <div class="quest-burst" aria-hidden="true">${Array.from({ length: UI_FEEDBACK.QUEST_BURST_PARTICLES }, (_, index) => `<span style="--spark-angle:${index * 30}deg;--spark-delay:${(index % 3) * 45}ms"></span>`).join('')}</div>
      <div class="quest-celebration-card"><span class="quest-celebration-icon">✓</span><div><small>QUEST COMPLETE</small><strong>${quest.title}</strong><em>${reward}</em></div></div>
    `;
    root.classList.remove('show');
    void root.offsetWidth;
    root.classList.add('show');
    hideTimer = setTimeout(() => root?.classList.remove('show'), UI_FEEDBACK.QUEST_CELEBRATION_MS);
  });
}
