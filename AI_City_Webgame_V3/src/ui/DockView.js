import { BOARD_TAP_COPY, ECONOMY_RULES, FACILITIES, FACILITY_BUILD_ORDER, FACILITY_GROUPS, UI_FEEDBACK, WORKFORCE_LEVELS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { facilityBuildAvailability, facilityUnlockMessage, selectFacility } from '../systems/BoardSystem.js';
import { effectiveFacilityStats } from '../systems/CityModifierSystem.js';
import { compactMetric, formatCredits } from './format.js';
import { eventBus, Events } from '../core/EventBus.js';

let dockEl = null;
let detailEl = null;
let panelEl = null;
let detailFacilityKey = null;
// 시설 카드를 고르는 즉시 독 패널을 접어 보드를 드러낸다(어디에 지을지 보여야 하므로).
// 칸을 골라 확정·취소하거나, 패널이 닫히거나, 건설 버튼으로 다시 펼치면 풀린다.
let collapsedForPlacement = false;
// 첫 건설을 확정하기 전까지는 시설을 고를 때마다 "빈 칸을 눌러 배치" 힌트를 띄운다.
let placementHintDismissed = false;

const FACILITY_DISPLAY_ORDER = new Map(FACILITY_BUILD_ORDER.map((facility, index) => [facility, index]));

export function initDockView(el, sharedDetailEl = null, sharedPanelEl = null) {
  dockEl = el;
  detailEl = sharedDetailEl;
  panelEl = sharedPanelEl;
  eventBus.on(Events.BUILD_PLAN_CHANGED, renderDock);
  eventBus.on(Events.BUILD_PLAN_CLEARED, () => expandDock());
  eventBus.on(Events.BUILD_PLAN_COMMITTED, () => {
    placementHintDismissed = true;
    expandDock();
  });
  eventBus.on(Events.HUD_PANEL_CHANGED, () => expandDock());
  // 접힌 독 상태에서 건설 버튼을 다시 누르면 패널을 닫는 대신 독을 다시 펼친다 —
  // 그래야 다른 시설로 바꾸려는 사람이 "버튼을 눌렀는데 아무 일도 없다"고 느끼지 않는다.
  eventBus.on(Events.HUD_PANEL_CLOSE_REQUESTED, (request) => {
    if (request?.name !== 'build') return;
    if (!collapsedForPlacement && gameState.constructionPlan.length === 0) return;
    request.preventClose();
    // 미리보기(무장 상태·대기 중인 계획)를 해제한 뒤 독을 다시 보여준다.
    eventBus.emit(Events.BUILD_PREVIEW_CANCEL_REQUESTED, {});
    expandDock();
  });
  eventBus.on(Events.GAME_RESET, () => {
    detailFacilityKey = null;
    collapsedForPlacement = false;
    placementHintDismissed = false;
  });
}

function expandDock() {
  collapsedForPlacement = false;
  renderDock();
}

function collapseDockForPlacement(pickedButton) {
  collapsedForPlacement = true;
  if (!placementHintDismissed) {
    eventBus.emit(Events.TOAST_SHOW, {
      ...BOARD_TAP_COPY.placementHint(FACILITIES[gameState.selectedFacility]?.name || '시설'),
      kind: 'placement-hint',
      duration: UI_FEEDBACK.PLACEMENT_HINT_MS,
    });
  }
  // 키보드로 카드를 골랐다면 포커스를 보드로 옮겨 방향키로 바로 칸을 고를 수 있게 한다.
  const board = pickedButton?.ownerDocument.getElementById('cityGrid');
  if (pickedButton && pickedButton === pickedButton.ownerDocument.activeElement) board?.focus({ preventScroll: true });
  renderDock();
}

export function facilityPresentation(key) {
  const reference = effectiveFacilityStats({
    type: key,
    level: 1,
    priority: FACILITY_GROUPS.ESSENTIAL_DEFAULT.includes(key) ? 'essential' : 'normal',
  });
  const labor = WORKFORCE_LEVELS[key];
  const baseResidentialTax = reference.income * ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO;
  const money = key === 'residential'
    ? `+${formatCredits(baseResidentialTax, { suffix: false })}~+${formatCredits(reference.income, { suffix: false })}/일`
    : reference.income
    ? `최대 +${formatCredits(reference.income - reference.upkeep, { suffix: false })}/일`
    : reference.upkeep
      ? `고정 -${formatCredits(reference.upkeep, { suffix: false })}/일`
      : `±${formatCredits(0, { suffix: false })}/일`;
  const power = reference.supply
    ? `최대 +${compactMetric(reference.supply)}E/일`
    : reference.demand
      ? `정상 -${compactMetric(reference.demand)}E/일`
      : '0E/일';
  const carbon = reference.carbon > 0
    ? `최대 ${compactMetric(reference.carbon)}/일`
    : reference.carbon < 0
      ? `도시 ${compactMetric(reference.carbon)}/일`
      : '0/일';
  const water = key === 'cooling'
    ? '자체 0 · 인접 절감'
    : reference.water > 0
      ? `최대 ${compactMetric(reference.water)}/일`
      : '0/일';
  const requiredWorkers = labor?.[1] || 0;
  const laborText = key === 'residential'
    ? `인구 +${requiredWorkers}`
    : requiredWorkers > 0 ? `필요 인력 ${requiredWorkers}명` : '필요 인력 없음';
  const economyLabel = key === 'residential'
    ? '주거 세금'
    : reference.income ? '최대 수익' : reference.upkeep ? '고정 운영비' : '일일 수익';
  const basisText = key === 'residential'
    ? `전력·고용이 부족해도 기본 +${formatCredits(baseResidentialTax, { suffix: false })}/일 · 배치 후 하단에서 도시 전체 실제 순변화 확인`
    : 'Lv.1 정상 운전 기준 · 하단은 도시 전체 실제 순변화';
  return { money, power, carbon, water, laborText, economyLabel, basisText, reference };
}

function renderFacilityDetail(requestedKey = null) {
  if (!detailEl) return;
  const key = requestedKey || detailFacilityKey || gameState.selectedFacility || Object.keys(FACILITIES)[0];
  detailFacilityKey = key;
  const facility = FACILITIES[key];
  const { money, power, carbon, water, laborText, economyLabel, basisText, reference } = facilityPresentation(key);
  const powerLabel = reference.supply ? '최대 발전' : reference.demand ? '정상 수요' : '전력';
  const locked = !facilityBuildAvailability(gameState, key).unlocked;
  // 이 영역은 호버·포커스뿐 아니라 renderDock()을 타고 매 틱 다시 그려진다.
  // 시설 버튼(아래)과 같은 방식으로 내용이 실제로 달라질 때만 DOM을 교체한다.
  const markup = `
    <div class="facility-detail-copy"><strong>${facility.icon} ${facility.name}</strong><p title="${facility.desc}">${facility.desc}</p><small class="facility-detail-basis">${basisText}</small>${locked ? `<em>${facilityUnlockMessage(gameState, key)}</em>` : ''}</div>
    <div class="facility-detail-stats">
      <span data-metric="credit" aria-label="크레딧" title="전력·인력·취업률과 공간 페널티 적용 전 Lv.1 기준"><small aria-hidden="true">💰 ${economyLabel}</small><b>${money}</b></span>
      <span data-metric="power" aria-label="전력" title="기후·연구 효과 적용 전 Lv.1 기준"><small aria-hidden="true">⚡ ${powerLabel}</small><b>${power}</b></span>
      <span data-metric="carbon" aria-label="이산화탄소" title="정상 운전 시 상한"><small aria-hidden="true">CO₂ 상한</small><b>${carbon}</b></span>
      <span data-metric="water" aria-label="물" title="정상 운전 시 상한. 순환냉각은 인접 대상에서 차감"><small aria-hidden="true">💧 물</small><b>${water}</b></span>
      <span data-metric="labor" aria-label="인력" title="인력"><small aria-hidden="true">👥</small><b>${laborText}</b></span>
    </div>
  `;
  if (detailEl.innerHTML !== markup) detailEl.innerHTML = markup;
}

function orderedFacilities() {
  return Object.entries(FACILITIES).sort(([left], [right]) => {
    const unlockedDifference = Number(!gameState.unlockedFacilities.has(left)) - Number(!gameState.unlockedFacilities.has(right));
    if (unlockedDifference) return unlockedDifference;
    return (FACILITY_DISPLAY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (FACILITY_DISPLAY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function renderDock() {
  const pending = gameState.constructionPlan.length > 0;
  // 시설을 고르거나 건설 위치를 정하면 독 패널 자체(배경까지)를 완전히 접어, 3D 보드 위
  // 미리보기와 O/X 위젯만 보이게 한다. 확정·취소하면 패널이 다시 미끄러져 나온다.
  const collapsed = pending || collapsedForPlacement;
  panelEl?.classList.toggle('build-panel--collapsed', collapsed);
  if (collapsed) return;

  const existingButtons = new Map([...dockEl.querySelectorAll('[data-facility]')]
    .map((button) => [button.dataset.facility, button]));
  orderedFacilities().forEach(([key, f]) => {
    const { locked, permit, permitBlocked, affordable, missingCredits } = facilityBuildAvailability(gameState, key, gameState.constructionPlan || []);
    const unaffordable = !affordable;
    const btn = existingButtons.get(key) || document.createElement('button');
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
        ? `${f.name} — ${formatCredits(missingCredits)} 부족`
        : `${f.name} — 보드에서 선택하면 인접 보너스/갈등 구역이 표시됩니다.`;
    const markup = `
      <div class="facility-card-main"><span class="f-icon">${f.icon}</span><span class="facility-card-identity"><strong>${f.name}</strong><span class="cost">-${formatCredits(f.cost)}</span>${!locked ? `<span class="facility-limit" aria-label="현재 ${permit.current}, 계획 ${permit.planned}, 최대 ${permit.limit}">${permit.current}${permit.planned ? ` +${permit.planned}` : ''} / ${permit.limit}</span>` : ''}</span></div>
    `;
    if (btn.innerHTML !== markup) btn.innerHTML = markup;
    if (!btn.dataset.bound) {
      btn.dataset.bound = 'true';
      btn.addEventListener('pointerenter', () => renderFacilityDetail(key));
      btn.addEventListener('focus', () => renderFacilityDetail(key));
      btn.addEventListener('click', () => {
        renderFacilityDetail(key);
        const current = facilityBuildAvailability(gameState, key, gameState.constructionPlan || []);
        if (current.locked || current.permitBlocked || !current.affordable) {
          eventBus.emit(Events.TOAST_SHOW, {
            title: `${f.name} 건설 불가`,
            text: current.locked
              ? facilityUnlockMessage(gameState, key)
              : current.permitBlocked
                ? current.permit.message
                : `${formatCredits(current.missingCredits)}가 더 필요합니다.`,
          });
          return;
        }
        selectFacility(key);
        collapseDockForPlacement(btn);
      });
    }
    dockEl.appendChild(btn);
    existingButtons.delete(key);
  });
  existingButtons.forEach((button) => button.remove());
  renderFacilityDetail();
}
