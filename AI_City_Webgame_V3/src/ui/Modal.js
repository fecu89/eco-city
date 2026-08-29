import {
  createIcons,
  ArrowRight,
  BadgeCheck,
  Bot,
  Brain,
  ChartNoAxesCombined,
  ChevronsUp,
  CircleHelp,
  Download,
  EyeOff,
  Hammer,
  Lightbulb,
  Map,
  Music,
  NotebookPen,
  Presentation,
  RotateCcw,
  Scale,
  ScanSearch,
  Search,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  TriangleAlert,
  Trophy,
  Volume2,
  VolumeX,
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
  ArrowRight,
  BadgeCheck,
  Bot,
  Brain,
  ChartNoAxesCombined,
  ChevronsUp,
  CircleHelp,
  Download,
  EyeOff,
  Hammer,
  Lightbulb,
  Map,
  Music,
  NotebookPen,
  Presentation,
  RotateCcw,
  Scale,
  ScanSearch,
  Search,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  TriangleAlert,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
};

let modalEl = null;
let cardEl = null;

export function initModal(modal, card) {
  modalEl = modal;
  cardEl = card;
  modalEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

export function setModal(html) {
  cardEl.innerHTML = html;
  modalEl.classList.remove('hidden');
  eventBus.emit(Events.MODAL_OPEN, {});
  createIcons({ icons: ICONS });
  anime({ targets: cardEl, scale: [0.96, 1], opacity: [0, 1], duration: 220, easing: 'easeOutCubic' });
}

export function closeModal() {
  modalEl.classList.add('hidden');
  cardEl.innerHTML = '';
  eventBus.emit(Events.MODAL_CLOSE, {});
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
