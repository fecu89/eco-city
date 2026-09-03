import anime from 'animejs';
import { eventBus, Events } from '../core/EventBus.js';
import { UI_FEEDBACK, VISUAL } from '../core/Constants.js';
import { prefersReducedMotion } from './motionPreference.js';

// 동시 표시 상한과 등장·퇴장 애니메이션 수치는 settings.json VISUAL.TOAST에 있다.
const TOAST = VISUAL.TOAST;
const MAX_VISIBLE_TOASTS = TOAST.MAX_VISIBLE;

let stackEl = null;

export function initToastView(el) {
  eventBus.on(Events.TOAST_DISMISS, ({ kind }) => {
    if (!stackEl || !kind) return;
    [...stackEl.querySelectorAll(`.toast.${kind}`)].forEach((toast) => playToast(toast, false));
  });
  stackEl = el;
  eventBus.on(Events.TOAST_SHOW, (options) => showToast(options));
  eventBus.on(Events.GAME_RESET, () => {
    if (stackEl) stackEl.replaceChildren();
  });
}

function removeToast(div) {
  playToast(div, false);
}

// 동작 줄이기를 켠 사용자에게는 미끄러지는 대신 바로 나타나고 바로 사라진다.
function playToast(div, entering) {
  if (!prefersReducedMotion()) {
    anime(priorityAnimation(div, entering));
    return;
  }
  if (!entering) {
    div.remove();
    return;
  }
  div.style.opacity = '1';
  div.style.transform = 'none';
}

function priorityAnimation(div, entering) {
  const priority = div.classList.contains('priority');
  return priority
    ? {
      targets: div,
      scale: entering ? [TOAST.PRIORITY_SCALE, 1] : [1, TOAST.PRIORITY_SCALE],
      opacity: entering ? [0, 1] : [1, 0],
      duration: entering ? TOAST.ENTER_MS : TOAST.EXIT_MS,
      easing: entering ? TOAST.ENTER_EASING : TOAST.EXIT_EASING,
      complete: entering ? undefined : () => div.remove(),
    }
    : {
      targets: div,
      translateX: entering ? [TOAST.SLIDE_IN_PX, 0] : [0, TOAST.SLIDE_OUT_PX],
      opacity: entering ? [0, 1] : [1, 0],
      duration: entering ? TOAST.ENTER_MS : TOAST.EXIT_MS,
      easing: entering ? TOAST.ENTER_EASING : TOAST.EXIT_EASING,
      complete: entering ? undefined : () => div.remove(),
    };
}

export function showToast({
  title,
  text = '',
  meta = '',
  kicker = '',
  priority = false,
  kind = '',
  action = null,
  actionLabel = '',
  duration = UI_FEEDBACK.TOAST_MS,
}) {
  if (!stackEl) return;
  // 짧은 시간에 토스트가 몰려도 화면을 뒤덮지 않도록 오래된 것부터 즉시 정리한다.
  // removeToast()의 제거는 애니메이션이 끝난 뒤(비동기) 일어나므로, 개수 제한은 반드시
  // DOM에서 바로(동기) 제거해야 한다 — 그렇지 않으면 children.length가 줄지 않아 무한 루프에 빠진다.
  while (stackEl.children.length >= MAX_VISIBLE_TOASTS) {
    stackEl.children[0].remove();
  }
  const div = document.createElement('div');
  div.className = ['toast', priority ? 'priority' : '', kind].filter(Boolean).join(' ');
  div.setAttribute('role', priority ? 'alert' : 'status');
  if (kicker) {
    const kickerEl = document.createElement('span');
    kickerEl.className = 'toast-kicker';
    kickerEl.textContent = kicker;
    div.appendChild(kickerEl);
  }
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  div.appendChild(titleEl);
  if (text) {
    const textEl = document.createElement('div');
    textEl.className = 'toast-text';
    textEl.textContent = text;
    div.appendChild(textEl);
  }
  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'toast-meta';
    metaEl.textContent = meta;
    div.appendChild(metaEl);
  }
  if (action) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'btn secondary toast-action';
    actionButton.dataset.toastAction = action;
    actionButton.textContent = actionLabel || '열기';
    actionButton.addEventListener('click', () => {
      eventBus.emit(Events.HUD_PANEL_OPEN_REQUESTED, { name: action });
      removeToast(div);
    });
    div.appendChild(actionButton);
  }
  stackEl.appendChild(div);
  playToast(div, true);
  setTimeout(() => {
    if (div.isConnected) removeToast(div);
  }, duration);
}
