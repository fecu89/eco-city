import {
  createIcons,
  Activity,
  BadgeCheck,
  Brain,
  BatteryCharging,
  Building2,
  ChartNoAxesCombined,
  Cloud,
  CloudFog,
  CloudRainWind,
  CloudSun,
  Coins,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Droplets,
  Factory,
  Fan,
  Flame,
  FlaskConical,
  Gauge,
  Hammer,
  HeartPulse,
  Lightbulb,
  Leaf,
  LockKeyhole,
  Map,
  Music,
  Network,
  Orbit,
  Presentation,
  Pin,
  PinOff,
  Recycle,
  RotateCcw,
  Scale,
  ScanSearch,
  ShieldCheck,
  Snowflake,
  Sun,
  ThermometerSun,
  Tornado,
  Trees,
  Moon,
  Pause,
  Play,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide';
import anime from 'animejs';
import { eventBus, Events } from '../core/EventBus.js';

// data-lucide="..." 속성으로 쓰는 아이콘만 명시적으로 등록 — 전체 아이콘셋 대신 트리쉐이킹.
// 주의: lucide의 replaceElement()는 data-lucide 값을 PascalCase로 변환해 이 맵에서 찾는다
// (예: "circle-help" -> "CircleHelp"). 키를 kebab-case로 쓰면 조용히 실패해서(콘솔 warn만 뜨고
// 에러는 안 남) 아이콘이 전부 안 보이는 상태가 된다 — 반드시 PascalCase 키를 써야 한다.
// 정의 파일(icon: '...')과 마크업(data-lucide="...")의 이름이 여기 다 있는지는
// tests/e2e/unit/icon-registry.spec.js가 대조한다.
const ICONS = {
  Activity,
  BadgeCheck,
  Brain,
  BatteryCharging,
  Building2,
  ChartNoAxesCombined,
  Cloud,
  CloudFog,
  CloudRainWind,
  CloudSun,
  Coins,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Droplets,
  Factory,
  Fan,
  Flame,
  FlaskConical,
  Gauge,
  Hammer,
  HeartPulse,
  Lightbulb,
  Leaf,
  LockKeyhole,
  Map,
  Music,
  Network,
  Orbit,
  Presentation,
  Pin,
  PinOff,
  Recycle,
  RotateCcw,
  Scale,
  ScanSearch,
  ShieldCheck,
  Snowflake,
  Sun,
  ThermometerSun,
  Tornado,
  Trees,
  Moon,
  Pause,
  Play,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Wrench,
  X,
  Zap,
};

// lucide/shared/utils/toPascalCase 와 같은 규칙 — 등록 여부를 lucide가 찾는 키로 판정한다.
function toPascalCase(name) {
  const camel = String(name).replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match, first, next) => (next ? next.toUpperCase() : first.toLowerCase()),
  );
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

export function hasIcon(name) {
  return Object.hasOwn(ICONS, toPascalCase(name));
}

export const ICON_NAMES = Object.freeze(Object.keys(ICONS).map(toKebabCase));

// 모달 우선순위. 숫자를 호출부에 직접 쓰지 않는다.
// CRITICAL: 도시가 멈춘 상태(게임오버·운영중단·최종시험 결과)
// IMPORTANT: 진행을 막는 선택(확장 방향 등)
// NORMAL: 플레이어가 직접 연 창
export const MODAL_PRIORITY = Object.freeze({ NORMAL: 0, IMPORTANT: 1, CRITICAL: 2 });

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let modalEl = null;
let cardEl = null;
let activeModal = null;
// $modal/$$modal이 조회하는 루트. 평소에는 카드지만, 더 중요한 모달에 밀려 대기열로 들어간
// 모달을 여는 동안에는(오프너가 리스너를 붙이는 동기 구간) 그 대기 내용을 가리킨다.
let contentRoot = null;
let openerElement = null;
const modalQueue = [];

function publicInfo(entry) {
  return {
    id: entry.id,
    pausesSimulation: entry.pausesSimulation,
    pauseReason: entry.pauseReason,
    dismissible: entry.dismissible,
    priority: entry.priority,
    persistent: entry.persistent,
  };
}

// isConnected만으로는 부족하다. focus()는 조용히 무시되므로 실제로 받을 수 있는지 따져야 한다.
// - 레이아웃 박스가 없으면(display:none 등) 불가.
// - visibility:hidden은 레이아웃 박스를 그대로 유지한 채 focus()만 거부한다. HUD 패널이
//   바로 이 방식으로 감춰지므로(.hud-panel-active 해제 -> visibility:hidden), 반드시 확인한다.
// - opacity:0은 포커스를 받을 수 있으므로 판정에서 제외한다(모달 진입 애니메이션도 opacity를 쓴다).
function isFocusable(element) {
  if (!element?.isConnected || typeof element.focus !== 'function' || element.disabled) return false;
  if (!(element.offsetWidth || element.offsetHeight || element.getClientRects().length)) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  }
  return getComputedStyle(element).visibility !== 'hidden';
}

function focusableIn(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isFocusable);
}

function applyDialogSemantics() {
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-modal', 'true');
  // 포커스 가능한 요소가 없던 이전 모달이 남긴 tabindex를 지운다.
  cardEl.removeAttribute('tabindex');
  // 스토리처럼 제목이 이미 id를 갖고 있으면 그 id를 쓴다 — 덮어쓰면 카드 안의
  // aria-labelledby 참조가 끊긴다.
  const heading = cardEl.querySelector('h1, h2, h3');
  if (!heading) {
    cardEl.removeAttribute('aria-labelledby');
    return;
  }
  if (!heading.id) heading.id = 'modalTitle';
  cardEl.setAttribute('aria-labelledby', heading.id);
}

function focusFirstInCard() {
  const target = focusableIn(cardEl)[0];
  if (target) {
    target.focus({ preventScroll: true });
    return;
  }
  cardEl.setAttribute('tabindex', '-1');
  cardEl.focus({ preventScroll: true });
}

// 모달이 열릴 때 WorldHud가 오프너를 품고 있던 HUD 패널을 닫는다. 패널이 감춰져 오프너가
// 포커스를 못 받는 상황이면, 그 패널을 다시 여는 레일/하단바 버튼으로 대신 돌려준다 —
// 그래야 키보드 사용자가 문서 맨 위부터 다시 Tab 하지 않는다.
function panelTriggerFor(opener) {
  const panel = opener?.closest?.('[data-hud-panel]');
  const name = panel?.dataset.hudPanel;
  if (!name) return null;
  return [...document.querySelectorAll(`[data-hud-target="${name}"]`)].find(isFocusable) || null;
}

function restoreOpenerFocus() {
  const opener = openerElement;
  openerElement = null;
  const target = isFocusable(opener) ? opener : panelTriggerFor(opener);
  target?.focus({ preventScroll: true });
}

function rememberOpener() {
  const active = document.activeElement;
  openerElement = active && active !== document.body && !cardEl.contains(active) ? active : null;
}

// 대기열은 우선순위 내림차순, 같은 우선순위 안에서는 들어온 순서.
function enqueue(entry) {
  const index = modalQueue.findIndex((queued) => queued.priority < entry.priority);
  if (index === -1) modalQueue.push(entry);
  else modalQueue.splice(index, 0, entry);
}

// 카드에 붙어 있던 노드를 그대로 떼어 보관한다 — innerHTML 문자열로 저장하면 오프너가
// 붙여 둔 이벤트 리스너가 사라져 다시 열었을 때 버튼이 죽는다.
function detachActiveContent() {
  const entry = activeModal;
  const holder = document.createElement('div');
  holder.append(...cardEl.childNodes);
  entry.content = holder;
  activeModal = null;
  return entry;
}

function discardActive() {
  const closing = activeModal;
  activeModal = null;
  cardEl.replaceChildren();
  if (closing) eventBus.emit(Events.MODAL_CLOSE, publicInfo(closing));
}

function showEntry(entry, html) {
  activeModal = entry;
  contentRoot = cardEl;
  cardEl.dataset.modalId = entry.id;
  if (entry.content) {
    cardEl.replaceChildren(...entry.content.childNodes);
    entry.content = null;
  } else {
    cardEl.innerHTML = html;
    refreshIcons(cardEl);
  }
  modalEl.classList.remove('hidden');
  applyDialogSemantics();
  eventBus.emit(Events.MODAL_OPEN, publicInfo(entry));
  anime({ targets: cardEl, scale: [0.96, 1], opacity: [0, 1], duration: 220, easing: 'easeOutCubic' });
  focusFirstInCard();
}

export function initModal(modal, card) {
  modalEl = modal;
  cardEl = card;
  contentRoot = card;
  modalEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') && activeModal?.dismissible !== false) closeModal();
  });
  document.addEventListener('keydown', handleModalKeydown);
  eventBus.on(Events.GAME_RESET, clearModalQueue);
}

function handleModalKeydown(event) {
  if (!activeModal) return;
  if (event.key === 'Escape') {
    if (activeModal.dismissible === false) return;
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = focusableIn(cardEl);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const current = document.activeElement;
  if (!cardEl.contains(current)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
    return;
  }
  if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return;
  }
  if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

export function setModal(html, {
  id = 'panel',
  pausesSimulation = false,
  dismissible = true,
  priority = MODAL_PRIORITY.NORMAL,
  persistent = !dismissible,
} = {}) {
  const entry = {
    id,
    pausesSimulation,
    pauseReason: id,
    dismissible,
    priority,
    persistent,
    content: null,
  };
  if (!activeModal) rememberOpener();

  if (activeModal && priority < activeModal.priority) {
    // 지금 열린 모달이 더 중요하다 — 내용은 미리 만들어 두고(오프너가 이어서 리스너를 붙인다)
    // 화면에는 앞 모달이 닫힐 때 올린다.
    const holder = document.createElement('div');
    holder.innerHTML = html;
    refreshIcons(holder);
    entry.content = holder;
    contentRoot = holder;
    // 오프너의 동기 바인딩이 끝나면 다시 활성 카드로 되돌린다.
    queueMicrotask(() => { if (contentRoot === holder) contentRoot = cardEl; });
    enqueue(entry);
    return;
  }

  if (activeModal && priority > activeModal.priority) {
    // 되돌아와야 하는 모달(dismissible:false)은 대기열 맨 앞으로 밀어 두고, 그 외에는 닫는다.
    if (activeModal.persistent) modalQueue.unshift(detachActiveContent());
    else discardActive();
  } else if (activeModal) {
    // 같은 우선순위는 지금까지처럼 교체한다 — 모달 안 이동(상세 -> 예측 -> 상세)이 이 경로다.
    discardActive();
  }
  showEntry(entry, html);
}

export function closeModal() {
  const closing = activeModal;
  activeModal = null;
  contentRoot = cardEl;
  modalEl.classList.add('hidden');
  delete cardEl.dataset.modalId;
  cardEl.replaceChildren();
  cardEl.removeAttribute('tabindex');
  // index.html이 들고 있는 기본값으로 되돌린다 — 제목이 없던 모달이 지운 채로 남지 않게.
  cardEl.setAttribute('aria-labelledby', 'modalTitle');
  if (closing) eventBus.emit(Events.MODAL_CLOSE, publicInfo(closing));
  const next = modalQueue.shift();
  if (next) {
    showEntry(next);
    return;
  }
  restoreOpenerFocus();
}

export function clearModalQueue() {
  modalQueue.length = 0;
}

export function getModalState() {
  return activeModal ? { ...publicInfo(activeModal), queueLength: modalQueue.length } : null;
}

// root를 주면 그 안의 <i data-lucide>만 SVG로 바꾼다. lucide의 createIcons는 [data-lucide]를
// 전부 다시 그리므로(이미 만들어진 SVG에도 data-lucide가 남는다) 문서 전체로 부르면 매 틱
// 페이지의 모든 아이콘이 새로 만들어진다.
export function refreshIcons(root = document) {
  if (!root?.querySelector('i[data-lucide]')) return;
  createIcons({ icons: ICONS, root });
}

// 현재 열린 모달 카드 안에서만 쿼리한다 (전역 id 충돌 방지).
export function $modal(selector) {
  return contentRoot.querySelector(selector);
}

export function $$modal(selector) {
  return [...contentRoot.querySelectorAll(selector)];
}
