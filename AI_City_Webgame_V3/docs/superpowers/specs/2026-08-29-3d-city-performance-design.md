# AI City 3D Board, Asset, and Performance Redesign

Date: 2026-08-29  
Status: Approved in chat; implementation pending

## Goal

Replace the current rebuild-heavy procedural board renderer with an interactive, performant city renderer that uses the local Kenney City Kit Industrial assets, makes facility levels visually distinct, and adds purposeful 3D motion without changing the educational game loop or index-based board contract.

The redesign must preserve all existing stage progression, placement, diagnosis, redesign, save, report, and test hooks.

## Current Findings

- Desktop mouse drag and mobile touch drag reach OrbitControls, but camera panning is explicitly disabled with `enablePan = false`.
- The symmetric empty board gives weak visual evidence that orbiting occurred, and there is no gesture hint or reset-view affordance.
- Drag/click suppression accumulates `movementX`/`movementY`, which is unreliable for touch pointers and can allow an orbit gesture to end as a cell click.
- Every board render destroys and recreates every building, marker, selection ring, and material, even when a single cell or preview changed.
- Disposal traverses meshes that use module-level shared geometries, causing shared GPU buffers to be discarded and uploaded again.
- With five buildings present, thirty facility-selection renders created and deleted 360 GPU buffers and grew the pre-GC JS heap by roughly 1.8 MB.
- The decorative background and board use separate continuously running WebGL render loops.
- Existing performance tests check only boot time and exceptions; they do not measure draw calls, buffer churn, render CPU, or camera input.

## Scope

### In scope

- Bounded orbit, pan, zoom, touch gestures, camera reset, and concise control hints.
- Reliable distinction between click/tap and drag/pinch gestures.
- Local loading and caching of selected City Kit Industrial GLB models and shared palette textures.
- Facility-to-model mapping, including lightweight procedural additions when the kit has no suitable object.
- Persistent, diff-based scene updates and instancing for repeated render elements.
- Level color, scale, and marker encoding.
- Placement, upgrade, demolition, selection, diagnosis, and facility-specific ambient motion.
- Adaptive pixel ratio and removal or throttling of the second continuous WebGL background.
- New camera, asset fallback, renderer-stat, and buffer-churn tests.
- Documentation and `progress.md` updates.

### Out of scope

- Free-walk or first-person WASD navigation.
- Physics, collision, avatars, or roads between cells.
- New facility rules, balance changes, stages, or educational content.
- Remote asset downloads, Meshy generation, or runtime network dependencies.
- Postprocessing such as bloom, SSAO, depth of field, or motion blur.

## Architecture

### Constants

Add all camera bounds, gesture thresholds, level palette definitions, model paths, asset scales, motion timings, renderer DPR caps, and performance budgets to `src/core/Constants.js`.

The public asset root will be `/assets/city-kit/`. Only the GLBs and textures used by the game will be copied into the game project.

### Events and state

Add events using the existing `domain:action` convention:

- `camera:changed`
- `camera:reset`
- `assets:ready`
- `assets:failed`
- `visual:motionStarted`
- `visual:motionCompleted`

Camera pose is view state and will not be persisted in `GameState`; reset, stage changes, and board-size changes return to the configured isometric view. Gameplay state remains unchanged.

### CityAssetLoader

Create `src/level/CityAssetLoader.js`.

Responsibilities:

- Load each required GLB once through `GLTFLoader`.
- Cache the resulting source geometry.
- Replace embedded duplicate materials and textures with shared level materials.
- Compute source bounds and normalize each model to a configured footprint and height.
- Return geometry descriptors suitable for `InstancedMesh` creation.
- Expose load progress and recover from individual model failures.
- Dispose only resources owned by the loader; never dispose a shared geometry from an instance or cell.

The loader must not fetch anything outside the game origin. A model failure falls back to the current recognizable procedural silhouette for that facility and emits `assets:failed` without blocking play.

### CityScene3D

Refactor `src/ui/CityScene3D.js` into a persistent renderer. The public contract remains:

- `initCityScene3D(container)`
- `renderCityScene3D(cellConfigs, size)`
- `setCellClickHandler(fn)`
- `disposeCityScene3D()`

`renderCityScene3D` compares the incoming config with the previous config and updates only changed cells. It never rebuilds the entire scene for a selection, preview, or diagnosis update.

Rendering layers:

1. One instanced tile mesh for the whole board.
2. One instanced building mesh per facility model or composite model part.
3. Shared instanced footprint/selection/diagnosis markers.
4. Small pooled motion systems for wind rotors, data lights, cooling vapor, and event feedback.

The raycaster intersects only the instanced tile mesh and resolves `instanceId` directly to the row-major cell index. No per-click array of tile objects is allocated.

### CameraController

Create `src/systems/CameraController.js`, wrapping `OrbitControls`.

Desktop controls:

- Left drag: orbit.
- Right drag or Shift+left drag: bounded pan.
- Wheel: zoom.
- Reset button: restore the configured isometric pose.

Mobile controls:

- One finger: orbit.
- Two fingers: pan and pinch zoom.
- Reset button: restore the configured isometric pose.

The target is clamped to the board footprint plus a small configured margin. Polar angle and distance remain bounded so the camera cannot go below the ground or lose the city.

Gesture classification uses pointer IDs and squared distance from the initial pointer position, not `movementX`/`movementY`. A pointer sequence classified as a drag, pinch, or pan must never call the cell click handler.

The board includes a small non-blocking control hint and a 44 px reset-view button. The hint fades after the first successful camera gesture and respects mobile safe areas.

## Asset Mapping

Use the local Kenney City Kit Industrial package, licensed CC0.

| Facility | Primary City Kit model | Procedural supplement |
|---|---|---|
| Residential | `building-a.glb` | None |
| Factory | `building-m.glb` | None |
| Data center | `building-d.glb` | Subtle shared emissive data-light instances |
| Thermal power | `building-l.glb` | Low-cost smoke/heat indicator |
| Nuclear power | `building-b.glb` | `chimney-large.glb` as a cooling tower |
| Solar | `building-q.glb` | None |
| Wind | `building-g.glb` | Lightweight rotating turbine |
| Battery storage | `building-r.glb` | None |
| Circulating cooling | `building-c.glb` | `detail-tank.glb` and pooled vapor |
| Green space | `building-p.glb` | Instanced trees around the structure |

If visual inspection during implementation shows that a mapped model is ambiguous at the game camera distance, substitute another existing `building-*.glb` from the same kit. This substitution does not change the architecture or gameplay contract.

## Level and State Encoding

Levels use redundant color, size, and marker encoding:

- Level 1: `variation-c` neutral gray, base scale, one pedestal segment.
- Level 2: default `colormap` blue, medium scale, two pedestal segments.
- Level 3: `variation-a` orange/gold, largest scale, three pedestal segments.
- Warning or diagnosis problem: red emissive footprint/ring; `variation-b` may be used only for transient alert feedback, not as a normal level.

The redundant marker ensures levels remain readable for color-vision deficiencies and in grayscale classroom projectors. Facility category continues to be conveyed by silhouette, icon text in the dock, and footprint accent; level color must not replace facility identity.

## Motion Design

Motion is purposeful and limited to changed or semantically active objects:

- Placement: rise from below the tile with overshoot, 420–520 ms.
- Upgrade: short lift, scale pulse, and level-color transition, 450–600 ms.
- Demolition: shrink and sink, 260–360 ms, then remove the instance.
- Selection: slow footprint pulse; the whole building does not bob continuously.
- Wind: rotor motion at a capped update rate.
- Data center: low-frequency data-light pulse.
- Cooling: small pooled vapor puffs.
- Thermal: sparse pooled heat/smoke indicator.
- Diagnosis and adjacency preview: footprint color and marker pulse without rebuilding geometry.

Animations use reusable state objects and temporary matrices. No per-frame geometry, material, vector, color, or array allocation is allowed in the hot path.

## Render Loop and Performance

- Use `renderer.setAnimationLoop()` for the board renderer.
- Cap delta time.
- Render continuously only while controls are damping, an animation is active, or a continuously animated facility is visible. Otherwise render on demand when marked dirty.
- Use adaptive DPR caps: desktop at most 1.5, mobile at most 1.25, configurable in constants.
- Replace the decorative WebGL background with equivalent CSS decoration, or render it only on demand. The final page must not keep two independent high-rate WebGL loops.
- Reuse geometry, level materials, matrices, colors, raycaster state, and instance buffers.
- Dispose resources once during renderer shutdown or asset-cache replacement.

Performance acceptance targets after warm-up:

- Full 6x6 city: no more than 24 board draw calls.
- Thirty facility-selection preview renders with an unchanged city: zero GPU buffer creates and zero GPU buffer deletes.
- Draw calls must decrease from baseline and render CPU p95 must not regress.
- No new resource count growth after three reset cycles.
- Headless FPS is informational only; draw calls, buffer churn, and CPU timing are authoritative.

## Error Handling

- Show the game immediately with procedural fallback objects while assets load.
- Swap to City Kit visuals only after all required descriptors for a facility are ready.
- Individual asset failures produce one non-blocking toast and retain the fallback.
- A WebGL creation failure leaves the surrounding DOM UI operational and shows a concise board-unavailable message.
- Asset errors and renderer statistics are exposed through test-only read APIs without leaking gameplay mutation methods.

## Testing

Keep all existing tests and add:

1. Mouse drag changes camera pose and does not place a facility.
2. Touch drag changes camera pose and does not place a facility.
3. Right/Shift drag pans within bounds.
4. Reset view restores the configured camera pose.
5. Wheel and pinch zoom stay within min/max distance.
6. Every facility resolves either to a loaded City Kit descriptor or its procedural fallback.
7. Levels 1–3 expose distinct palette and scale metadata.
8. Thirty preview changes after warm-up create/delete no GPU buffers.
9. Full 6x6 representative city stays within the draw-call budget.
10. Three resets do not increase renderer-owned geometry, texture, or program counts.
11. Existing raycast index, diagnosis, save, report, visual, and mobile tests continue to pass.

Visual review must include desktop and 390x844 mobile screenshots for an empty board, a mixed level city, diagnosis state, and a camera-rotated city.

## Files

Expected additions:

- `src/level/CityAssetLoader.js`
- `src/systems/CameraController.js`
- `public/assets/city-kit/*.glb`
- `public/assets/city-kit/*.png`
- Camera and renderer performance tests

Expected modifications:

- `src/core/Constants.js`
- `src/core/EventBus.js`
- `src/ui/CityScene3D.js`
- `src/ui/GridView.js`
- `src/ui/DiagnosisView.js`
- `src/ui/ThreeBackground.js`
- `src/main.js`
- `src/style.css`
- `tests/fixtures/game-test.js`
- `tests/e2e/game.spec.js`
- `tests/e2e/mobile.spec.js`
- `tests/e2e/perf.spec.js`
- `progress.md`
- `docs/architectural-decisions/0002-3d-board-rendering.md` or a superseding ADR

## Delivery Order

1. Add regression tests and renderer/camera diagnostics for the current failures.
2. Introduce constants, events, and the bounded camera controller.
3. Introduce the cached asset loader and local asset subset.
4. Replace full scene rebuilding with persistent diff-based instancing.
5. Add level encoding and bounded motion systems.
6. Remove the second continuous WebGL loop and apply adaptive DPR.
7. Run build, full tests, performance measurements, and desktop/mobile visual review.
8. Update progress and ADR documentation with measured before/after results.
