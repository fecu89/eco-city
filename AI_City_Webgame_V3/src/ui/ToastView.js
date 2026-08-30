import anime from 'animejs';
import { eventBus, Events } from '../core/EventBus.js';

const MAX_VISIBLE_TOASTS = 3;

let stackEl = null;

export function initToastView(el) {
  stackEl = el;
  eventBus.on(Events.TOAST_SHOW, ({ title, text, priority = false }) => showToast(title, text, priority));
}

function removeToast(div) {
  anime(priorityAnimation(div, false));
}

function priorityAnimation(div, entering) {
  const priority = div.classList.contains('priority');
  return priority
    ? {
      targets: div,
      scale: entering ? [0.96, 1] : [1, 0.96],
      opacity: entering ? [0, 1] : [1, 0],
      duration: entering ? 300 : 240,
      easing: entering ? 'easeOutCubic' : 'easeInCubic',
      complete: entering ? undefined : () => div.remove(),
    }
    : {
      targets: div,
      translateX: entering ? [30, 0] : [0, 40],
      opacity: entering ? [0, 1] : [1, 0],
      duration: entering ? 300 : 240,
      easing: entering ? 'easeOutCubic' : 'easeInCubic',
      complete: entering ? undefined : () => div.remove(),
    };
}

export function showToast(title, text = '', priority = false) {
  if (!stackEl) return;
  // 짧은 시간에 토스트가 몰려도 화면을 뒤덮지 않도록 오래된 것부터 즉시 정리한다.
  // removeToast()의 제거는 애니메이션이 끝난 뒤(비동기) 일어나므로, 개수 제한은 반드시
  // DOM에서 바로(동기) 제거해야 한다 — 그렇지 않으면 children.length가 줄지 않아 무한 루프에 빠진다.
  while (stackEl.children.length >= MAX_VISIBLE_TOASTS) {
    stackEl.children[0].remove();
  }
  const div = document.createElement('div');
  div.className = `toast${priority ? ' priority' : ''}`;
  div.setAttribute('role', priority ? 'alert' : 'status');
  div.innerHTML = `<strong>${title}</strong>${text ? `<div>${text}</div>` : ''}`;
  stackEl.appendChild(div);
  anime(priorityAnimation(div, true));
  setTimeout(() => {
    if (div.isConnected) removeToast(div);
  }, 2800);
}
