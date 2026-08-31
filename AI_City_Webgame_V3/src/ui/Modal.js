import {
  createIcons,
  Brain,
  BatteryCharging,
  Building2,
  ChartNoAxesCombined,
  CloudSun,
  Coins,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Droplets,
  Hammer,
  Lightbulb,
  Leaf,
  Map,
  Music,
  Network,
  Presentation,
  Pin,
  PinOff,
  RotateCcw,
  Scale,
  ScanSearch,
  Sun,
  Moon,
  Pause,
  Play,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  X,
  Zap,
} from 'lucide';
import anime from 'animejs';
import { eventBus, Events } from '../core/EventBus.js';

// data-lucide="..." 속성으로 쓰는 아이콘만 명시적으로 등록 — 전체 아이콘셋 대신 트리쉐이킹.
// 주의: lucide의 replaceElement()는 data-lucide 값을 PascalCase로 변환해 이 맵에서 찾는다
// (예: "circle-help" -> "CircleHelp"). 키를 kebab-case로 쓰면 조용히 실패해서(콘솔 warn만 뜨고
// 에러는 안 남) 아이콘이 전부 안 보이는 상태가 된다 — 반드시 PascalCase 키를 써야 한다.
const ICONS = {
  Brain,
  BatteryCharging,
  Building2,
  ChartNoAxesCombined,
  CloudSun,
  Coins,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Droplets,
  Hammer,
  Lightbulb,
  Leaf,
  Map,
  Music,
  Network,
  Presentation,
  Pin,
  PinOff,
  RotateCcw,
  Scale,
  ScanSearch,
  Sun,
  Moon,
  Pause,
  Play,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  X,
  Zap,
};

let modalEl = null;
let cardEl = null;
let activeModal = null;

export function initModal(modal, card) {
  modalEl = modal;
  cardEl = card;
  modalEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') && activeModal?.dismissible !== false) closeModal();
  });
}

export function setModal(html, { id = 'panel', pausesSimulation = false, dismissible = true } = {}) {
  if (activeModal) eventBus.emit(Events.MODAL_CLOSE, activeModal);
  activeModal = { id, pausesSimulation, pauseReason: id, dismissible };
  cardEl.innerHTML = html;
  modalEl.classList.remove('hidden');
  eventBus.emit(Events.MODAL_OPEN, activeModal);
  createIcons({ icons: ICONS });
  anime({ targets: cardEl, scale: [0.96, 1], opacity: [0, 1], duration: 220, easing: 'easeOutCubic' });
}

export function closeModal() {
  const closing = activeModal;
  activeModal = null;
  modalEl.classList.add('hidden');
  cardEl.innerHTML = '';
  if (closing) eventBus.emit(Events.MODAL_CLOSE, closing);
}

export function getModalState() {
  return activeModal ? { ...activeModal } : null;
}

export function refreshIcons() {
  createIcons({ icons: ICONS });
}

// 현재 열린 모달 카드 안에서만 쿼리한다 (전역 id 충돌 방지).
export function $modal(selector) {
  return cardEl.querySelector(selector);
}

export function $$modal(selector) {
  return [...cardEl.querySelectorAll(selector)];
}
