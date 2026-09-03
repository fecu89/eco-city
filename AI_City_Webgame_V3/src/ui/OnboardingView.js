import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { closeModal, MODAL_PRIORITY, $modal, setModal } from './Modal.js';

export const ONBOARDING_VERSION = 3;

const STORY_PAGES = Object.freeze([
  Object.freeze({
    chapter: '긴급 기록 01',
    date: '2040-01-01',
    title: '2040년, 멈춰가는 도시',
    copy: '지구 온난화가 가속한 해수면 상승으로 저지대가 침수됐고, 반복된 폭염과 전력난·물 부족까지 겹쳐 기존 도시 기반시설이 무너졌습니다.',
    accent: '해수면 상승 · 전력 위기 · 폭염',
  }),
  Object.freeze({
    chapter: '도시 운영 명령',
    date: '가용 예산 10.00 💰',
    title: '당신은 새 도시 운영자',
    copy: '남은 고지대 섬에서 주거지부터 복구하고 전력과 일자리를 연결하세요. 1배속에서는 1초마다 게임 속 1일의 수입·유지비·전력·탄소가 정산됩니다. 안내 뒤에는 하단 퀘스트 메뉴에서 현재 목표와 보상을 확인할 수 있습니다.',
    accent: '주거 2개 → 전력 → 일자리 · 섬 도시',
  }),
  Object.freeze({
    chapter: '생존 목표',
    date: '예상 작전 시간 15~30분',
    title: '생존에서 전환으로',
    copy: '바다에 둘러싸인 이 섬은 최대 37칸뿐입니다. 6개 기초 퀘스트를 마치면 확장 방향과 선택 목표를 직접 정합니다. 예보를 보고 시설 모드·저장 정책·연구를 조절한 뒤 마지막 도시 스트레스 테스트를 통과하세요.',
    accent: '6개 기초 퀘스트 → 선택 목표 → 기후 이벤트 → 최종 시험',
  }),
]);

let storyPage = 0;

function renderStory() {
  const page = STORY_PAGES[storyPage];
  // 스토리는 가장 낮은 우선순위다 — 부팅 때 게임오버 모달이 열려 있으면 그 뒤로 대기한다.
  setModal(`
    <section class="story-dossier" aria-labelledby="storyTitle">
      <div class="story-signal"><span>${page.chapter}</span><b>${page.date}</b></div>
      <div class="story-index" aria-hidden="true">${String(storyPage + 1).padStart(2, '0')}</div>
      <div class="story-copy">
        <p class="story-kicker">CITY RECOVERY PROTOCOL</p>
        <h1 id="storyTitle">${page.title}</h1>
        <p>${page.copy}</p>
        <strong>${page.accent}</strong>
      </div>
      <div class="story-progress" aria-label="스토리 ${storyPage + 1} / ${STORY_PAGES.length}">
        ${STORY_PAGES.map((_, index) => `<span class="${index <= storyPage ? 'active' : ''}"></span>`).join('')}
      </div>
      <button class="btn primary story-next" id="storyNext" type="button">
        ${storyPage === STORY_PAGES.length - 1 ? '도시 복구 시작' : '다음 기록'}
      </button>
    </section>
  `, { id: 'story', pausesSimulation: true, priority: MODAL_PRIORITY.NORMAL });
  $modal('#storyNext').addEventListener('click', () => {
    if (storyPage < STORY_PAGES.length - 1) {
      storyPage += 1;
      renderStory();
      return;
    }
    gameState.onboardingVersionSeen = ONBOARDING_VERSION;
    gameState.tutorialStep = 'build-button';
    closeModal();
    syncTutorialHighlight();
    eventBus.emit(Events.SAVE_REQUESTED, {});
  });
}

function clearTutorialHighlights() {
  document.querySelectorAll('.tutorial-focus').forEach((element) => element.classList.remove('tutorial-focus'));
}

export function syncTutorialHighlight() {
  clearTutorialHighlights();
  if (gameState.tutorialComplete) return;
  const selectors = {
    'build-button': '[data-hud-target="build"]',
    'home-card': '[data-facility="residential"]',
    'place-home': '#cityGrid',
    'time-hud': '#simulationHud',
    'claim-reward': '[data-hud-target="quest"]',
    'claim-reward-button': '#questPanelClaimBtn',
  };
  const selector = selectors[gameState.tutorialStep];
  if (!selector) return;
  document.querySelectorAll(selector).forEach((element) => element.classList.add('tutorial-focus'));
}

function advanceTutorial(step) {
  if (gameState.tutorialComplete) return;
  gameState.tutorialStep = step;
  syncTutorialHighlight();
}

export function initOnboardingView() {
  eventBus.on(Events.HUD_PANEL_CHANGED, ({ activePanel }) => {
    if (gameState.tutorialStep === 'build-button' && activePanel === 'build') advanceTutorial('home-card');
    if (gameState.tutorialStep === 'claim-reward' && activePanel === 'quest') advanceTutorial('claim-reward-button');
  });
  eventBus.on(Events.BOARD_FACILITY_SELECTED, ({ key }) => {
    if (gameState.tutorialStep === 'home-card' && key === 'residential') advanceTutorial('place-home');
  });
  eventBus.on(Events.BOARD_PLACED, () => {
    if (gameState.tutorialStep !== 'place-home') return;
    if (gameState.grid.filter((cell) => cell?.type === 'residential').length >= 2) advanceTutorial('time-hud');
  });
  eventBus.on(Events.QUEST_READY, ({ quest }) => {
    if (quest?.index === 1 && ['time-hud', 'place-home'].includes(gameState.tutorialStep)) advanceTutorial('claim-reward');
  });
  eventBus.on(Events.QUEST_CLAIMED, ({ quest }) => {
    if (quest?.index !== 1) return;
    gameState.tutorialComplete = true;
    gameState.tutorialStep = 'complete';
    clearTutorialHighlights();
  });
  eventBus.on(Events.GAME_RESET, () => {
    storyPage = 0;
  });
}

export function openStory({ replay = false } = {}) {
  if (!replay && gameState.onboardingVersionSeen >= ONBOARDING_VERSION) return false;
  storyPage = 0;
  renderStory();
  return true;
}

export function getOnboardingState() {
  return { storyPage, version: ONBOARDING_VERSION, tutorialStep: gameState.tutorialStep, tutorialComplete: gameState.tutorialComplete };
}
