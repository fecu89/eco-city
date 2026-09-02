# 2040 기후 생존 도시 — 전체 리뷰 (2026-09-02)

- 대상 커밋: `01cea0d` (`퀘스트, ui 개선`) — 리뷰 도중 커밋됐으며, 리뷰한 코드와 동일하다.
- 비교 기준: `docs/game-system-audit-recheck-2026-08-31.md`
- 범위: 아키텍처, 3D 렌더링·성능, 게임 로직·밸런스, UI·접근성, 최근 변경분(19단계 캠페인·분기·저장 마이그레이션·레벨별 모델), 테스트, 문서, 저장소 위생, 교육 설계 정합성
- 방법: 제품 코드는 수정하지 않았다. 빌드와 전체 Playwright 회귀를 실행했고, 다섯 영역을 각각 독립 검토한 뒤 근거(파일:줄)를 대조했다.

## 1. 결론

핵심 루프(전력망·경제·연구·건설·기후 이벤트)는 이전 재점검 때 남아 있던 세 가지 결함이 모두 해결돼 수학적으로 일관된다. 렌더러는 ADR-0003의 계약(영구 인스턴스 메시, 유휴 시 0 draw, 버퍼 생성/삭제 0/0)을 실제로 지킨다. 저장 마이그레이션은 v1→v9까지 버전별 단위 테스트가 있다.

반면 지금 상태로 수업에 투입하면 학생이 실제로 막히는 경로가 세 가지 있다.

1. **19단계 최종시험에서 보드가 잠긴다.** UI는 "강화·긴급 건설을 계속 사용할 수 있다"고 안내하고 비용 1.2배 규칙까지 있지만, `STAGES.REPORT`가 `isEditable`을 false로 만들어 배치·강화·철거가 전부 거절된다.
2. **6단계 보상 직후 새로고침하면 확장 방향 선택이 사라져 7단계가 영구히 막힌다.**
3. **v8 저장(15단계 시절)을 v9로 옮기면 두 종류의 저장이 소프트락된다.** 기후 퀘스트를 진행 중이던 저장은 조력 연구가 영원히 잠겨 18단계에 못 들어가고, 서부 분기에서 7단계로 되돌린 저장은 풍력이 해금되지 않아 7단계를 못 끝낸다.

그 밖에 눈에 보이는 결함으로, 기후 퀘스트·HUD·연구 화면이 쓰는 아이콘 17종이 lucide 등록 목록에 없어 빈 자리로 그려진다.

| 영역 | 점수 | 요약 |
| --- | ---: | --- |
| 아키텍처 (6) | 4 / 6 | 디렉터리·이벤트 상수는 통과. EventBus·GameState·Constants·오케스트레이터는 부분 통과 |
| 성능 (5) | 3.5 / 5 | 델타 캡·에셋 로딩 통과. 풀링·자원 해제·리스너 정리는 부분 통과 |
| 코드 품질 (4) | 2 / 4 | 순환 의존 0. 단일 책임 실패(1,868·859·774줄 모듈), 오류 처리·명명은 부분 통과 |
| 수익화 준비 (4) | 1 / 4 | 점수 체계만 있음. 교실용 게임이라 설계상 불필요 |
| 빌드 | 통과 | JS 1,245KB(gzip 366KB) 단일 청크. 코드 분할 없음 |
| 전체 회귀 | 아래 5절 | 521개 중 기존 실패 다수. 시(hour)→일(day) 전환·목표 세트 제거·15→19단계 전환의 잔재 |

## 2. 우선 수정 항목 (High)

### H1. 최종시험(19단계)에서 도시가 얼어붙는다

- `src/systems/QuestSystem.js:43-45`가 19단계를 `STAGES.REPORT`로 매핑하고 `src/systems/ClimateQuestSystem.js:352`가 18단계 보상 시 REPORT를 설정한다. `src/core/GameState.js:149-151`의 `isEditable`이 REPORT에서 false라 `src/systems/BoardSystem.js:281,318,442`가 배치·강화·철거를 모두 거절한다.
- 그런데 `src/ui/StageModals.js:717`은 "강화·긴급 건설을 계속 사용할 수 있습니다"라고 안내하고, `src/systems/ConstructionPlanSystem.js:41-43`은 시험 중 건설비 1.2배 규칙을 적용한다. 둘 중 하나는 죽은 코드다.
- 수정: `stageForQuest`와 `ClimateQuestSystem.js:352`에서 FINAL_TEST를 REDESIGN으로 두고, 보드 잠금은 `stage`가 아니라 `stressTest.status`를 기준으로 하는 명시적 규칙으로 바꾼다.

### H2. 확장 선택 모달이 새로고침에 유실된다

- 6단계 보상은 `src/ui/QuestView.js:75` → `src/systems/BoardSystem.js:464-468` 경로로만 선택 모달을 띄운다. `src/systems/SaveSystem.js:55`가 `QUEST_CLAIMED`에서 자동저장하므로, 모달을 닫기 전 새로고침하면 `questIndex 7, expansion.phase 0, unlockedFacilities [residential]` 상태로 복구된다.
- 7단계는 `solar2`(선행 `facility:solar`, `src/core/ResearchDefinitions.js:22`)를 요구하는데 태양광은 확장 선택으로만 해금된다. 다음 해금은 8단계 보상이라 진행 불가.
- 수정: 로드 또는 렌더 시 `questIndex >= PREPARATION_START && expansion.phase === 0`이면 `EXPANSION_CHOICE_REQUESTED`를 다시 발행한다.

### H3. v8→v9 저장 마이그레이션 소프트락 두 종류

- `src/systems/SaveSystem.js:555-596`은 `questIndex`만 재매핑하고 `claimedQuestIds`·`unlockedFacilities`·`expansion`은 그대로 둔다.
- (a) 기후 퀘스트 진행 중이던 v8 저장(예: questIndex 8, 폭염 완료)은 12단계로 옮겨지지만 준비 퀘스트 7~10이 claimed에 없다. `tidal1`은 `unlockAfterQuestId: 'wind-pilot-grid'`(`ResearchDefinitions.js:27`)에 묶여 영원히 잠기고, `ClimateQuestSystem.js:36-40,173-180`이 18단계 브리핑을 `tidal_preparation_required`로 거절한다. 풍력도 해금되지 않고(옛 장마 보상 제거), 2차 확장도 8단계 보상에서만 발동하므로 28칸에 머문다.
- (b) `unfinishedFirstClimate`로 7단계로 되돌린 서부 분기 저장은 `firstChoice: 'west'`라 `wind2`를 요구하지만, v8은 풍력을 장마 보상으로만 해금했고 마이그레이션이 `activateExpansionSide`를 다시 실행하지 않는다. 8단계 서부 보상은 태양광이라 풍력은 끝까지 안 열린다.
- 수정: 마이그레이션에서 `questIndex >= CLIMATE_START`면 준비 퀘스트 4개를 claimed에 추가하고 battery/solar/wind를 해금하며 phase 1은 phase 2(37칸)로 승격한다. `phase >= 1`이면 `EXPANSION_SIDES[firstChoice].facility`를 해금한다.

### H4. 모달 큐가 없어 중요한 모달이 덮어씌워진다

- `src/ui/Modal.js:98-107`은 새 모달이 열리면 이전 모달을 교체하고 이전 모달의 `MODAL_CLOSE`를 발행한다. 시설 상세(`StageModals.js:394`), 강화 예측(`:520`), 철거 확인(`:653`), 건설 위험(`:806`), 공사 취소(`:602`, `dismissible:false`)는 시뮬레이션을 멈추지 않으므로 틱에서 발생하는 `OPERATIONAL_RISK_PAUSE`·`GAME_OVER`·`STRESS_TEST_FINISHED`(`src/main.js:543,625-628`)가 이들을 덮는다.
- 부팅 순서도 문제다. `main.js:641-643`이 게임오버 모달을 연 직후 `openStory()`(`:647`)가 실행되는데, `ONBOARDING_VERSION`이 올라간 상태면 스토리가 게임오버 모달을 교체하고 그 `MODAL_CLOSE`가 `main.js:601-605`에서 시뮬레이션을 재개한다.
- 수정: 우선순위 큐를 두고, 닫힌 `dismissible:false` 모달은 다음 모달이 닫힐 때 다시 연다.

### H5. lucide 아이콘 17종 미등록

- `src/ui/Modal.js:1-39`의 import 목록에 없는 이름이 `icon:` 필드와 `data-lucide`로 쓰인다. 전체 회귀 콘솔에 `icon name was not found` 경고가 반복된다.
- 누락: `thermometer-sun`, `cloud-rain-wind`, `tornado`, `snowflake`, `cloud-fog`, `flame`, `activity`, `heart-pulse`(기후 퀘스트 8종, `src/core/ClimateCampaignDefinitions.js`), `flask-conical`, `shield-check`, `recycle`, `badge-check`, `wrench`(HUD 미션 단계, `src/ui/HudView.js:15-16,44`), `lock-keyhole`(연구 잠금, `src/ui/ResearchView.js:83`), `shield-check`(`ResearchDefinitions.js:32`), `cloud`(`src/ui/ForecastView.js`).
- 수정: 해당 아이콘을 import해 `ICONS`에 추가한다. 정의 파일의 아이콘 이름을 등록 목록과 대조하는 단위 테스트를 하나 추가하면 재발을 막는다.

### H6. 새 방문 연출이 정산마다 끊긴다

- `src/ui/CityScene3D.js:777-800`의 `rebuildAmbientTopology()`가 `birdVisit = null`로 초기화하는데, 이 함수는 `renderCityScene3D`(`:1638`)마다 실행되고 `refreshAll()`이 매 정산(1배속 1초)마다 이를 호출한다. 방문 연출은 2,000ms(`src/systems/AmbientBirdSystem.js:31`)라 항상 도중에 잘린다.
- 수정: `greenIndex`가 더 이상 녹지가 아닐 때만 방문을 취소한다.

### H7. 회귀 테스트가 현재 설계와 어긋나거나 약해졌다

- 실행 중 확인된 기존 실패: `tests/e2e/game.spec.js:229`(리셋 스냅샷이 `gameTime.hour: 8`을 기대, 현재는 일 단위), `tests/e2e/gameplay-redesign.spec.js:35`(6단계 직후 폭염 경보를 기대, 현재는 7단계 연구 준비), `tests/e2e/hex-scene.spec.js:34`(`progression.objectiveSetId === 'transition-choice'` 기대, 목표 세트 계층은 제거됨), `tests/e2e/hud.spec.js:185`(건설 팔레트 레이아웃). `tests/e2e/mobile.spec.js:91`은 `LEVEL 1 / 15`를 기대한다(현재 19).
- 약해진 테스트: `tests/e2e/unit/quest-feasibility.spec.js:99`는 5단계 수치 검증(저탄소 ≥ 40, 탄소 ≤ 12, 순수익 > 0)과 6단계 물 ≤ 15를 `expect.any(Number)`로 바꿨다. `campaign-playthrough.spec.js`의 서부 분기 기준 캠페인이 삭제됐고, 대체한 `quest-expansion-branch.spec.js:41,59`는 `state.grid[0]`에 직접 쓰기 때문에 허가 검사를 우회한다(그래서 M6을 잡지 못했다). `gameplay-redesign.spec.js`는 1~6단계 실제 플레이를 6단계 상태 주입으로 대체했다. `perf.spec.js` draw-call 예산은 24→40으로 완화됐다.

## 3. 중간 우선순위 (Medium)

### 게임 규칙·밸런스

- **M1. 발전소 탄소가 급전과 무관하다.** `src/systems/EconomySystem.js:61`이 수요 0인 시설에 `powerRatio = 1`을 주고, `src/systems/FacilityOperationSystem.js:61-67`은 `max(0.25, operationRatio)`를 쓴다. 화력이 0E를 송전해도 CO₂ 8을 배출하며 `lowCarbonPercent`는 100이 된다. "저탄소 우선 급전"이 탄소 지표에 아무 영향이 없어 이 게임의 교육 포인트가 약해진다. 16·17단계와 최종시험은 사실상 화력 철거를 요구하는데, 핵발전 예비력 규칙(`src/systems/FacilityPermitSystem.js:82-87`)이 11단계 전까지 철거를 막는다. 수정: 발전 시설의 `operationRatio`를 실제 송전량/가용량으로 계산한다.
- **M2. 물 한도 기준이 불리하게 잡힌다.** 15단계 한도는 4단계 보상 시점 `baseline.dailyWater`의 0.7배(`QuestSystem.js:64-65`, `ClimateModifierSystem.js:48`)라 4단계를 작게 끝낸 도시일수록 15단계가 어렵다. 최종시험 비폭염 일은 절대값 `DEFAULT_WATER_LIMIT 10`(`StressTestSystem.js:74-79`, `Constants.js:263`)인데 Lv1 주거 8 + 핵발전 2.5만으로 초과한다. 열돔 6일은 상한 6과 같아 0.7 규칙이 무의미하다.
- **M3. 보고서가 옛 시험 길이로 나눈다.** `src/systems/ReportSystem.js:71`의 `stressDays = 27`. 실제 `FINAL_CLIMATE_PHASES` 합은 41일이라 정전·탄소·물 위반 비율이 부풀려진다(clamp가 100% 초과를 가린다).
- **M4. 19단계에 무작위 도시 이벤트가 새로 생성된다.** `src/systems/CityEventSystem.js:43-47,161`이 챕터 4를 허용해 `ensureSchedule`이 시험 준비 중·종료 후에도 이벤트 덱을 만들고, `StressTestSystem.js:55`가 활성 이벤트를 조용히 버린다.
- **M5. `ready_to_claim`이 고정된다.** `QuestSystem.js:26-38`이 준비 상태를 설정한 뒤 조건이 다시 깨져도(예: Lv2 데이터센터 철거) 되돌리지 않고, 수령은 상태만 본다(`:53`).
- **M6. 서부 분기 7단계 안내가 거짓이다.** `src/core/QuestDefinitions.js:129`는 "서부 확장에서 해금된 풍력발전을 건설하세요"라 하지만 `src/core/Constants.js:157` 7행에는 `solar: 2`만 있고 `wind`는 8행부터다. 새 게임·서부·7단계에서 `validatePlacement(state,'wind',…)` → `facility_limit`, "풍력 허가 0/0". 퀘스트 자체는 연구만으로 완료되지만 동부와 대칭이 아니다. 수정: 7행에 `wind: 2` 추가(최대값 병합이라 동부에 무해).

### 시간 단위 전환 잔재

- **M7.** `src/systems/QuestSystem.js:212`(`case 13`)가 `summary.hour`를 읽지만 `SimulationSystem.js:70-102`는 더 이상 `hour`를 내보내지 않는다. 11~14 케이스(`:199-219`)는 옛 번호이며 `:128`의 조기 반환으로 현재는 도달 불가. 삭제 대상.
- **M8.** v7→v8 마이그레이션(`SaveSystem.js:485`)이 `elapsedGameHours`만 24로 나누고 나머지 시간 카운터는 1:1 복사한다(`:396-397,408,420,491,503-504,520,522`). 100시간 위기 카운터가 100일이 된다. `events.schedule`의 `startAt/endAt`은 손대지 않는다. 한 가지 규칙으로 통일해야 한다.

### 상태·저장

- **M9. 로드 후 `metrics`가 재계산되지 않는다.** `GAME_LOADED` 리스너가 없고 `refreshMetrics`는 보드 조작에서만 호출된다(`BoardSystem.js:409,424,451,460`). 새로고침 직후 레이더 차트가 비고 `BOARD_PLACED` 페이로드가 `metrics: null`을 실어 보낸다.
- **M10. 언로드 시 저장 플러시가 없다.** 디바운스 600ms(`SaveSystem.js:22-25`), 틱 저장은 10초 스로틀(`:12,27-40`). `pagehide`/`beforeunload`가 없어 건설 직후 새로고침이나 최대 10게임일의 정산이 유실된다.
- **M11. 부팅 경로의 `localStorage`가 보호되지 않는다.** `ThemeManager.js:21,38`, `WorldLightingManager.js:21,38`, `FloatingPanelController.js:25`, `QuestPanelController.js:21`. 저장소를 차단한 브라우저(학교 공용 PC의 시크릿 모드 등)에서 부팅이 중단된다.
- **M12. 리셋이 모듈 전역 UI 상태를 안 지운다.** `GAME_RESET`을 듣는 곳은 4개뿐. `QuestView.js:31-32`, `StageModals.js:49`, `DockView.js:12`, `GridView.js:21-22`, `OnboardingView.js:31`의 상태가 살아남는다.

### 성능

- **M13. 시계 rAF 루프가 매 프레임 DOM 작업을 한다.** `src/ui/ContinuousClockView.js:28-32`가 항상 60fps로 돌며 `syncConstructionHud`(`CityScene3D.js:692-724`)를 호출한다. 프레임마다 `filter/map/Set` 할당, 프로젝트당 `new THREE.Vector3`(`:705`), `getBoundingClientRect` 2회, 배지당 `querySelector` 4회. 진행률 변화가 0.5% 미만이면 건너뛰고 일시정지 시 루프를 멈춰야 한다.
- **M14. 매 틱 문서 전체 아이콘 재생성.** `HudView.js:108` → `refreshIcons()` → `createIcons`(`Modal.js:123`)가 `refreshAll`마다 실행돼 초당 1~4회 페이지의 모든 아이콘을 다시 만든다. `createIcons({root})`로 범위를 좁힌다.
- **M15. draw-call 예산 테스트가 최악 경우를 놓친다.** 측정 38(`perf.spec.js:106`)은 야간 조명·공사 기초/비계·연기·상태등·호버 고스트가 빠진 값이다. 합치면 약 45로 예산 40을 넘는다.
- **M16. 해제 경로가 죽은 코드이며 누수가 있다.** `disposeCityScene3D`(`CityScene3D.js:1780`)와 `disposeCityAssets`는 어디서도 호출되지 않는다. 호출된다 해도 `InstancedMesh.dispose()` 미호출, `AssetLoader.dispose()`(`AssetLoader.js:72-86`)가 텍스처 `map` 미해제, 폴백 지오메트리가 VRAM에 남는다.

### UI·접근성

- **M17. 모달 접근성 부재.** `role="dialog"`, `aria-modal`, 포커스 트랩, 초기 포커스, 포커스 복원, Escape 처리가 없다(`index.html:164-167`, `Modal.js`). `WorldHud.js:117-118`은 모달이 없을 때만 Escape를 처리한다.
- **M18. 3D 보드는 포인터 전용.** `#cityGrid`에 tabindex·keydown이 없어 키보드로 시설을 놓거나 검사할 수 없다.
- **M19. 스크린리더 폭주.** `#simulationHud aria-live="polite"`(`index.html:38`)가 매 틱 다시 쓰이고(`SimulationHudView.js:58-62`), `#facilityDetail aria-live`는 호버마다 갱신된다(`DockView.js:138`).
- **M20. 효과음 음소거가 배경음을 끈다.** `AudioManager.js:21`이 `sound && musicEnabled`를 요구하고, `AUDIO_TOGGLE_MUTE`(`:49-54`)가 배경음을 멈추는데 `#musicBtn`은 켜짐으로 남는다. AudioContext 재개가 `pointerdown` 한 번뿐(`:58`)이라 키보드 사용자는 소리를 못 듣는다. `sfx.js`의 9개 정의 중 7개는 발행되지 않는다.
- **M21. 게임 규칙이 UI에 중복돼 있다.** `QuestView.js:135-141`이 퀘스트 진행률 계산을 재구현하고(`QuestSystem.js:27-28,130,224`와 중복), `DockView.js:78-79,107-114`가 잠금·구매 가능·조력 연구 여부를, `ResearchView.js:65-68`이 `canStart`를 다시 계산한다. `StageModals.js:303-304`는 존재하지 않는 퀘스트 id `'living-neighborhood'`를 참조한다. 임계값 문자열도 하드코딩돼 있다(`StageModals.js:719,754-758,820,827`, `SimulationHudView.js:93-94`, `main.js:619-620`, "24일" 8곳).
- **M22. 7·8단계 진행 바가 0%에서 곧장 100%로 뛴다.** `QuestView.js:133-141`이 연구·현대화 퀘스트에도 `consecutiveDays/required`를 쓴다.

### 문서·저장소

- **M23. 설계 문서가 현재 게임을 설명하지 않는다.** `docs/gameplan.md`는 여전히 "소스 오브 트루스"를 자처하며 6단계 교수 설계(AI 무지성 실행 → 위기 → 개념 → 진단 → 재설계)를 기술하지만 현재 게임에 AI 어드바이저·대화록·진단 단계는 없다(`SaveSystem.js:203`이 관련 필드를 제거한다). `docs/tech.md`는 15퀘스트·"5초=1시간"·`DiagnosisSystem`·`AchievementSystem`을 적고 있다. `docs/architectural-decisions/0003`은 ambient 30fps를 적었으나 코드는 10Hz(`Constants.js:389`)다.
- **M24. 저장소에 원본 에셋 아카이브 72MB가 추적된다.** `assets-source/archives` 672파일(zip과 압축 해제된 GLB 전체), `.superpowers/brainstorm` 서버 pid 파일까지 git에 들어 있다. `public/assets`(3.4MB, 실제 배포분)와 `selection.json`만 있으면 재현되므로 아카이브는 `.gitignore` 대상이다.
- **M25. 단일 1.25MB 청크.** three.js·chart.js·animejs·lucide가 한 파일이다. 학교망 첫 로딩을 위해 `build.rollupOptions.output.manualChunks`로 three를 분리하고 chart.js는 도시 상태 패널을 열 때 동적 import하는 것이 좋다.

## 4. 낮은 우선순위·정리 항목 (Low)

- 죽은 코드·데이터: `ObjectiveSystem`, `ObjectiveView`(호출자 없음), `OBJECTIVE_SETS`, `FACILITY_LIMITS_BY_OBJECTIVE_STAGE`, `QUEST_REQUIREMENTS.FIRST_SOLAR_LOW_CARBON_PERCENT`, `QUIZ_KINDS = {}`(`QuestView.js:33`, 퀴즈 퀘스트 분기 도달 불가), `STAGES.CRISIS/CONCEPTS/DIAGNOSIS`, `FACILITY_LIMITS_BY_QUEST` 11~13행(옛 7~9행 복사본, 어떤 한도도 올리지 않음), `quizAccelerationBankDays`(항상 0, `ResearchSystem.js:107`), `.quest-tracker` CSS 11개 규칙, `questPanelContextAction`(`main.js:112`, DOM 없음), 보충 레이어(`CityAssetLoader.js:123`, 항상 null), `energy.` 접두 분기.
- 하드코딩 퀘스트 번호: `QuestSystem.js:43,55,62-66,87-93,115`, `SimulationSystem.js:16-19`(옛 6/11 경계 탄소 목표), `BoardSystem.js:329,353`(서부 분기에서 동부 제목 표시), `QuestView.js:135-136`, `HudView.js:79,86,258`.
- 상수 중복: `main.js:619-620`·`SimulationHudView.js:93-94`·`StageModals.js:820`의 24일/12일/5%(= `CITY_FAILURE_RULES`), `CarbonCrisisSystem.js:5-6`의 168/144, `BoardSystem.js:160-213` 점수 가중치, `:231,236` 1.45, `:241` 0.5, `:475`가 선언 전 상수 4200 사용, `SaveSystem.js:12` 10000ms, `SIMULATION.DAY_MS`와 `TIME.BASE_DAY_MS` 중복.
- 계층 역전: `GameState.js:3`이 `systems/ConstructionProjectSystem.js`를 import한다(순환은 아님). `normalizeConstructionProject`를 `core/`로 옮긴다.
- 렌더러 소소: `worldPosition()`(`CityScene3D.js:654`) 호출마다 객체 할당, `updateWindRotorInstances`(`:813`) 로터마다 Map 복사, `syncBuildGhost`(`:1554`)가 같은 칸 호버에도 `needsRender`, `CameraController.js:80-87` `pointercancel` 항목 누적, 클릭 판정이 리스너 등록 순서에 의존, 로딩 문구를 두 곳이 경쟁해서 씀(`:1414` vs `main.js:465-472`), 공사 진행 배지는 화면 밖으로 나갈 수 있음(OX 위젯만 clamp).
- 저장 마이그레이션 소소: `stripObsoleteState`(`SaveSystem.js:208`)가 `ai`로 시작하는 모든 키를 지움(취약), 알 수 없는 상위 버전 저장은 `reset()` 후 다음 자동저장이 덮어씀, `workforceRebalanceGraceDays: 24`·`timeScale: 1` 하드코딩.
- 로직 소소: 필수시설 0개면 정전 0%로 계산돼 12일 뒤 게임오버(`SimulationSystem.js:111-113`, `CityFailureSystem.js:56-59`), `national-climate-test`는 `claimedQuestIds`에 들어가지 않아 보고서 `completedQuests`에서 빠짐, 연구 취소 시 퀴즈 가속 크레딧이 유지돼 재시작 연구는 가속 불가, `round1(upkeep)`(`EconomySystem.js:75`)이 Lv2 유지비 0.14를 0.1로 뭉갬, 탄소 경보 마일스톤이 회복 후 초기화되지 않아 두 번째 경보 없음, 긴급 지원은 전체 퀘스트 모달 안에서만 도달 가능(`QuestView.js:404-410`).
- UI 소소: `StageModals.js:143` `aria-valuenow`가 0~1인데 `:567` `aria-valuemax="100"`, 터치 타겟 30×30(`style.css:602`)·34×32(시간 컨트롤), `index.html:57` "CH.3에서 활성화"·`:145` "0시간"·`:78` "LEVEL 1 / 15"(부팅 시 덮어쓰지만 dev 모드에서는 잠깐 보임), 용어 혼용(LEVEL/레벨/단계/임무/퀘스트/CHAPTER, 일/게임일), `EventResultView.js:11`·`QuestView.js:167`이 `formatCredits` 우회, `compactMetric` 두 벌(`DockView.js:25`, `SimulationHudView.js:19`), `rewardText` 중복(`QuestView.js:107-127` vs `FeedbackBridge.js:8-28`), JS 애니메이션이 `prefers-reduced-motion` 미반영(`Modal.js:106`, `ToastView.js:97`, `StageModals.js:703`), `.world-status`가 `safe-area-inset-top` 미반영, `HudView.js:107`이 저장 파일 유래 문자열을 이스케이프 없이 `innerHTML`에 넣음(사용자 입력은 없어 localStorage 변조 시에만 문제).
- `render_game_to_text`가 `lastTickSummary` 전체(routes, facilityPower, modifiers)와 레거시 `stage`/`turn`을 덤프해 간결하지 않다.

## 5. 검증 결과

- `npm run build`: 통과. HTML 12.73KB, CSS 88.03KB(gzip 17.18KB), JS 1,245.79KB(gzip 366.00KB). 500KB 청크 경고만 남는다.
- `npx playwright test`(521개, 단일 워커): 결과는 아래 표. 실패는 모두 이번 리뷰 이전부터 존재하던 것으로 `progress.md` 36~40차가 이미 "무관한 기존 실패"로 기록한 범주와 일치한다.

| 결과 | 개수 |
| --- | ---: |
| 통과 | 494 |
| 실패 | 26 |
| 재시도 후 통과(flaky) | 1 (`quest-ui.spec.js:275`) |
| 소요 | 16.7분 |

실패 26건의 원인 분류:

| 원인 | 건수 | 테스트 |
| --- | ---: | --- |
| 15→19단계 재번호·분기 도입 후 기대값 미갱신 | 12 | `mobile.spec.js:85`(LEVEL 1 / 15), `perf.spec.js:65`(주거 허가 9/9, "퀘스트 17"), `facility-tech.spec.js:87,148`("퀘스트 6"·"퀘스트 8" 해금 문구), `gameplay-redesign.spec.js:4`, `objectives-ui.spec.js:26,36,51`, `hex-scene.spec.js:21`(`objectiveSetId`), `zones.spec.js:95`(조력 배치 `ok:false`), `city-events.spec.js:103`(브리핑이 일정을 소유해야 하는데 이벤트 23개가 추가됨), `perf.spec.js:215`(예보 스트립에 '무풍·미세먼지' 없음, WebGL 버퍼 단계까지 못 감) |
| 시(hour)→일(day) 단위 전환 잔재 | 7 | `game.spec.js:203`(`gameTime.hour`), `calendar.spec.js:10`(08:00), `carbon-crisis.spec.js:12,35`("two hours"), `climate.spec.js:41`(three-hour forecast), `construction-operations.spec.js:63,106` |
| 밸런스 수치·연구 목록 변경 후 기대값 미갱신 | 3 | `hud.spec.js:185`(인구 +10 → +6), `city-modifiers.spec.js:43`(공장 모드 수요 계수), `visual.spec.js:169`(연구 카드 9 → 11) |
| 시각 스냅샷 드리프트 | 4 | `visual.spec.js:43,61,114,126` |

`perf.spec.js:215`의 실패 지점은 이벤트 예보 문구라서, "HUD 30회 전환 시 WebGL 버퍼 생성/삭제 0/0" 계약 자체가 깨졌다는 증거는 없다. 다만 이 계약을 다시 확인하려면 테스트의 이벤트 설정을 새 번호로 고쳐야 한다. `city-events.spec.js:103`은 3절 M4(19단계 무작위 이벤트 생성)와 같은 계열일 가능성이 있어 기대값만 고치지 말고 원인을 확인해야 한다.

## 6. 교육 설계 정합성

`docs/gameplan.md`의 6단계 인과 사슬 중 현재 게임에 남은 것과 사라진 것을 사실만 적는다.

| 원래 단계 | 현재 상태 |
| --- | --- |
| 1. 무지성 실행(AI 조언대로 짓기, 대화록) | 없음. `src`에 어드바이저·대화록 코드가 없고 `SaveSystem.js:203`이 관련 필드를 삭제한다 |
| 2. 위기 직면(숨은 비용 공개) | 탄소 위기 경보와 기후 이벤트로만 남음. "공개" 순간은 없음 |
| 3. 개념 학습(퀴즈, 뇌-AI 에너지 비교) | 연구 퀴즈 44문항 + 최종 퀴즈 4문항으로 남음. 에너지 비교는 없음 |
| 4. 진단(스캐너) | 없음. 이벤트 결과의 한 줄 진단 라벨만 남음(`CityEventSystem.js:98-106`) |
| 5. 재설계 | 연속 퀘스트 기반 건설로 대체됨 |
| 6. 성적표 | `ReportSystem.js`로 남음. 점수 축은 30/20/20/15/15(문서의 50/30/20 아님) |

지도안의 핵심인 "AI 조언을 검증한다"는 경험은 현재 게임에 없다. 이것이 의도한 방향 전환(`docs/AI_CITY_GAMEPLAY_REDESIGN_SPEC.md`)이라면 `gameplan.md`를 현재 설계로 다시 써서 어느 문서가 기준인지 분명히 해야 한다. 지도안과의 연결을 유지하려면 M1(급전이 탄소에 반영되도록)이 가장 값싼 교육적 개선이다.

## 7. 잘 된 점

- `createSimulationController`(`SimulationSystem.js:181-270`): 타임아웃 체인, 일시정지·배속 변경 시 분수 진행률 보존, 이유 집합 기반 일시정지. `Modal.js:99-100`이 이전 모달의 일시정지 이유를 정리해 이유 누수가 없다.
- `createDaySettler`는 주입된 의존성 위의 순수 함수라 건설·강화 예측(`main.js:302,336`)에 그대로 재사용된다.
- 이벤트 이름은 `domain:action` 상수 90여 개로 통일됐고 원시 문자열 발행이 0건이다. import 그래프 79파일·307간선에 순환이 없다.
- 저장 경로 전체가 try/catch로 보호되고, 마이그레이션이 순수 함수이며 v3~v9 버전별 단위 테스트가 있다. `normalizeCell`이 로드마다 레벨·프로젝트·배터리 저장량을 방어적으로 보정한다.
- 배터리 모델이 하나의 일관된 상태 기계다(보조 수요 → `canOperate` → 방전/충전/예비, `PowerNetworkSystem.js:148-325`). 급전 순서(저탄소 → 효율 → 인덱스)가 결정적이라 60도 회전 대칭이 검증된다.
- 건설 계획은 허가·인력·예비력·크레딧을 원자적으로 검사한다(`ConstructionPlanSystem.js:24-105`).
- 렌더러: 37칸 전 레이어 사전 할당, `prewarmGpuBuffers`로 버퍼 선할당, 유휴 시 0 draw, 30회 재그리기 동안 버퍼 생성/삭제 0/0을 테스트로 강제. DPR 캡(1.5/1.25), 그림자·후처리 없음이라 모바일에 적합.
- 에셋 파이프라인: 선별 → 최적화(meshopt) → 감사, 라이선스 각주까지 기록(`ASSET_LICENSES.md`). 52개 GLB 경로가 모두 존재한다.
- `ToastView`는 `textContent`만 쓰고 3개로 제한하며, `WorldHud`는 Escape/닫기 시 포커스를 복원하고, `FloatingPanelController`는 키보드 드래그와 `destroy()`를 갖췄다.

## 8. 권장 순서

1. H1·H2·H3(진행 막힘)와 H5(아이콘)를 먼저 고친다. 모두 작은 변경이며 회귀 테스트 한 개씩 붙일 수 있다.
2. H7의 기존 실패 테스트를 현재 설계에 맞게 고치고, 약해진 `quest-feasibility`·분기 플레이스루 테스트를 실제 `validatePlacement` 경로로 되돌린다. 이 단계가 끝나야 이후 변경의 회귀 신호가 살아난다.
3. H4(모달 큐)와 M9~M12(로드·저장·리셋 일관성)를 처리한다.
4. M1(급전 반영 탄소)과 M2~M4(밸런스·보고서)는 수업 전 플레이테스트 한 번과 함께 조정한다.
5. 문서(`gameplan.md`, `tech.md`, ADR-0003)를 현재 설계로 갱신하고, `assets-source/archives`와 `.superpowers`를 git 추적에서 뺀다.
6. 여유가 있을 때 `CityScene3D.js`를 렌더러/레이어/모션/앰비언트/미리보기/오버레이/입력으로 분할하고 `StageModals.js`를 모달별 파일로 나눈다.
