import { FACILITIES, FACILITY_ECONOMY, WORKFORCE_LEVELS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { facilityUnlockMessage, selectFacility } from '../systems/BoardSystem.js';
import { formatCredits } from './format.js';
import { eventBus, Events } from '../core/EventBus.js';
import { QUESTS } from '../core/QuestDefinitions.js';
import { getFacilityPermit } from '../systems/FacilityPermitSystem.js';

let dockEl = null;
let detailEl = null;
let detailFacilityKey = null;

const FACILITY_UNLOCK_ORDER = new Map([
  ['residential', 0],
  ...QUESTS
    .filter((quest) => quest.reward.unlockFacility)
    .map((quest) => [quest.reward.unlockFacility, quest.index]),
]);

export function initDockView(el, sharedDetailEl = null) {
  dockEl = el;
  detailEl = sharedDetailEl;
  eventBus.on(Events.BUILD_PLAN_CHANGED, renderDock);
  eventBus.on(Events.BUILD_PLAN_CLEARED, renderDock);
  eventBus.on(Events.BUILD_PLAN_COMMITTED, renderDock);
}

function facilityPresentation(key, facility) {
  const economy = FACILITY_ECONOMY[key];
  const labor = WORKFORCE_LEVELS[key];
  const money = economy.income ? `+${formatCredits(economy.income, { suffix: false })}/h` : economy.upkeep ? `-${formatCredits(economy.upkeep, { suffix: false })}/h` : `±${formatCredits(0, { suffix: false })}/h`;
  const power = facility.supply ? `+${facility.supply}E/h` : facility.demand ? `-${facility.demand}E/h` : '0E/h';
  const laborText = key === 'residential' ? `인구 +${labor?.[1] || 0}` : labor ? `일자리 +${labor[1]}` : '무인 시설';
  return { money, power, laborText };
}

function renderFacilityDetail(requestedKey = null) {
  if (!detailEl) return;
  const key = requestedKey || detailFacilityKey || gameState.selectedFacility || Object.keys(FACILITIES)[0];
  detailFacilityKey = key;
  const facility = FACILITIES[key];
  const { money, power, laborText } = facilityPresentation(key, facility);
  const locked = !gameState.unlockedFacilities.has(key)
    || (key === 'tidal' && (gameState.research.techLevels.tidal || 0) < 1);
  detailEl.innerHTML = `
    <div class="facility-detail-copy"><strong>${facility.icon} ${facility.name}</strong><p>${facility.desc}</p>${locked ? `<em>${facilityUnlockMessage(gameState, key)}</em>` : ''}</div>
    <div class="facility-detail-stats">
      <span data-metric="credit" aria-label="크레딧" title="크레딧"><small aria-hidden="true">💰</small><b>${money}</b></span>
      <span data-metric="power" aria-label="전력" title="전력"><small aria-hidden="true">⚡</small><b>${power}</b></span>
      <span data-metric="carbon" aria-label="이산화탄소" title="이산화탄소"><small aria-hidden="true">CO₂</small><b>${facility.carbon}/h</b></span>
      <span data-metric="water" aria-label="물" title="물"><small aria-hidden="true">💧</small><b>${facility.water}/h</b></span>
      <span data-metric="labor" aria-label="인력" title="인력"><small aria-hidden="true">👥</small><b>${laborText}</b></span>
    </div>
  `;
}

function orderedFacilities() {
  return Object.entries(FACILITIES).sort(([left], [right]) => {
    const unlockedDifference = Number(!gameState.unlockedFacilities.has(left)) - Number(!gameState.unlockedFacilities.has(right));
    if (unlockedDifference) return unlockedDifference;
    return (FACILITY_UNLOCK_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (FACILITY_UNLOCK_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function renderDock() {
  dockEl.innerHTML = '';
  orderedFacilities().forEach(([key, f]) => {
    const questLocked = !gameState.unlockedFacilities.has(key);
    const researchLocked = key === 'tidal' && (gameState.research.techLevels.tidal || 0) < 1;
    const locked = !gameState.isEditable || questLocked || researchLocked;
    const unaffordable = gameState.credits < f.cost;
    const permit = getFacilityPermit(gameState, key, gameState.constructionPlan || []);
    const permitBlocked = !locked && !permit.ok;
    const btn = document.createElement('button');
    btn.className = 'facility-btn'
      + (gameState.selectedFacility === key ? ' active' : '')
      + (locked ? ' locked' : '')
      + (unaffordable ? ' unaffordable' : '')
      + (permitBlocked ? ' permit-capped' : '');
    btn.setAttribute('aria-disabled', String(locked || unaffordable || permitBlocked));
    btn.dataset.facility = key;
    btn.title = locked
      ? `${f.name} — ${facilityUnlockMessage(gameState, key)}`
      : permitBlocked
        ? `${f.name} — ${permit.message}`
        : unaffordable
        ? `${f.name} — ${formatCredits(f.cost - gameState.credits)} 부족`
        : `${f.name} — 보드에서 선택하면 인접 보너스/갈등 구역이 표시됩니다.`;
    btn.innerHTML = `
      <div class="facility-card-main"><span class="f-icon">${f.icon}</span><span class="facility-card-identity"><strong>${f.name}</strong><span class="cost">-${formatCredits(f.cost)}</span>${!locked ? `<span class="facility-limit" aria-label="현재 ${permit.current}, 계획 ${permit.planned}, 최대 ${permit.limit}">${permit.current}${permit.planned ? ` +${permit.planned}` : ''} / ${permit.limit}</span>` : ''}</span></div>
    `;
    btn.addEventListener('pointerenter', () => renderFacilityDetail(key));
    btn.addEventListener('focus', () => renderFacilityDetail(key));
    btn.addEventListener('click', () => {
      renderFacilityDetail(key);
      if (locked || unaffordable || permitBlocked) {
        eventBus.emit(Events.TOAST_SHOW, {
          title: `${f.name} 건설 불가`,
          text: locked
            ? facilityUnlockMessage(gameState, key)
            : permitBlocked
              ? permit.message
              : `${formatCredits(f.cost - gameState.credits)}가 더 필요합니다.`,
        });
        return;
      }
      selectFacility(key);
      renderDock();
    });
    dockEl.appendChild(btn);
  });
  renderFacilityDetail();
}
