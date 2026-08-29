import { UI_FEEDBACK } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

let celebrationEl = null;
let hideTimer = null;

function particle(index) {
  const spark = document.createElement('span');
  spark.style.setProperty('--spark-angle', `${index * (360 / UI_FEEDBACK.ACHIEVEMENT_BURST_PARTICLES)}deg`);
  spark.style.setProperty('--spark-delay', `${(index % 3) * 45}ms`);
  return spark;
}

function showAchievement({ id, badge }) {
  if (!celebrationEl || !badge) return;
  clearTimeout(hideTimer);
  celebrationEl.replaceChildren();
  celebrationEl.dataset.badgeId = id;

  const burst = document.createElement('div');
  burst.className = 'achievement-burst';
  burst.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < UI_FEEDBACK.ACHIEVEMENT_BURST_PARTICLES; index++) {
    burst.appendChild(particle(index));
  }

  const card = document.createElement('div');
  card.className = 'achievement-celebration-card';
  const icon = document.createElement('span');
  icon.className = 'achievement-celebration-icon';
  icon.textContent = badge.icon;
  const copy = document.createElement('div');
  const label = document.createElement('small');
  label.textContent = 'ACHIEVEMENT UNLOCKED';
  const title = document.createElement('strong');
  title.textContent = badge.name;
  copy.append(label, title);
  card.append(icon, copy);
  celebrationEl.append(burst, card);

  celebrationEl.classList.remove('show');
  void celebrationEl.offsetWidth;
  celebrationEl.classList.add('show');
  hideTimer = setTimeout(() => celebrationEl?.classList.remove('show'), UI_FEEDBACK.ACHIEVEMENT_CELEBRATION_MS);
}

export function initAchievementCelebration(element) {
  celebrationEl = element;
  eventBus.on(Events.BADGE_UNLOCKED, showAchievement);
}
