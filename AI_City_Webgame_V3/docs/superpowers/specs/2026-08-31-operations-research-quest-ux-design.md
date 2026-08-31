# Operations, Research, and Quest UX Design

## Goal

Make the city-builder's blocking alerts, early economy, facility inspector, research quizzes, movable HUD panels, quest readability, and background music behave as one coherent game flow.

## Approved decisions

- The last thermal reserve restriction uses the global modal layer, never a toast beneath the facility inspector.
- The desktop tool rail no longer shows `CITY CONTROL`.
- Background music starts after the first eligible user gesture when music is enabled. A saved mute preference remains respected.
- Claiming a quest does not open a reward modal. The existing completion effect is paired with a central reward/unlock alert and the next quest starts immediately.
- Quest 1 unlocks both the factory and thermal plant. Quest 2 teaches planning them together and requires an adjacent factory/thermal pair. Quest 3 validates profitable powered factory operation.
- Quest 5 is a transition target, not the final carbon-safe target: nuclear power, at least 40% low-carbon delivered power, `CO₂/h <= 12`, and positive net credits for two consecutive hours.
- The compact quest card keeps its one-line summary. A lower expand/collapse control reveals the full goal, explicit conditions, progress guidance, and reward without opening another modal.
- A facility inspector uses a fixed header, tab navigation, a scrollable middle, and a fixed footer. Data centers expose `운영 / 연구 / 관리`; other facilities expose `운영 / 관리`.
- Every active research job has a `퀴즈로 가속` action. It opens four questions assigned only to that research. Each correct answer removes one quarter of that research's original duration, so four correct answers can finish it.
- Five research definitions receive four energy questions each (20 total). Answer options are shuffled without mutating source definitions. The correct index is recalculated per session.
- Quest 8 no longer asks for a second standalone clean-power quiz; it requires the solar research result and a level-2 solar facility. The final climate council quiz remains.
- City status and settings panels use the same whole-header desktop drag behavior and saved positions as the quest panel. Mobile panels remain bottom sheets and do not drag.
- All 15 quest gates receive actual-system feasibility coverage using the real power-network and economy calculators where those systems affect completion.

## UX behavior

### Quest card

Collapsed state shows level, title, single-line goal, progress bar, reward, and primary actions. The bottom `전체 내용 펼치기` button expands an in-panel detail region. The expanded region lists the exact requirements from quest definitions, explains consecutive-hour requirements, and keeps all text wrapped. Its label and `aria-expanded` state change to `간단히 보기` when open.

### Facility console

The global modal remains the accessibility and focus boundary. Inside it, `.facility-console` owns three zones:

1. Sticky header: facility identity, level, live summary, close.
2. Sticky tab row: operation, research when applicable, management.
3. Scroll area: only the selected tab's content.
4. Sticky footer: context actions, with upgrade and demolition in management.

Blocked demolition replaces the inspector with an undismissed restriction card at modal z-index 100. Its confirm action returns to the same facility inspector.

### Research quiz

A research quiz stores `quizResearchId` with the session. The shuffled question objects store their already-materialized prompt and shuffled options, so rerenders and saves do not move answers. Correct answers call targeted acceleration only for that research. Final-quest quiz answers do not accelerate research.

## Data and compatibility

- Quest rewards gain `unlockFacilities: string[]`; legacy `unlockFacility` is retained in claim results while callers migrate.
- Existing saves without the new quiz target or panel position keys load with safe defaults.
- Existing `musicEnabled: false` is respected. New games default to music enabled and begin only after a browser-approved interaction.
- Research jobs stay independent per data center.
- The climate game-over safe threshold remains `CO₂/h 8`; quest 5's `12` is explicitly presented as a temporary transition ceiling.

## Verification

- Unit tests cover unlock order, quest 2 adjacency, quest 5 threshold 12, quest 8 without a duplicate quiz, option shuffling, targeted acceleration, and 20-question assignment.
- Browser tests cover the top-level demolition restriction, no reward modal, reward alert, expandable quest details, facility tabs and scroll region, research quiz launch, movable status/settings panels, and first-gesture music start.
- A campaign feasibility test builds representative valid cities and advances real power/economy summaries through all non-quiz quest gates.
- Visual tests review desktop and mobile quest expansion plus the data-center facility console.
- The production build and the full Playwright suite run before completion.

## Constraints

- Do not add external audio or asset dependencies.
- Do not push, commit, deploy, merge, or otherwise mutate Git history; this repository is not owned by the user.
- Preserve the existing EventBus/GameState/Constants architecture and mobile performance budget.
