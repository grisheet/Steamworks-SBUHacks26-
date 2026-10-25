# STEAMWORKS — Seven-level release

## What changed
- Preserved the workshop identity, Levels 1–4, fixed-socket gear engine and existing MediaPipe control.
- Revised Level 5 into a clearer transition; added Advanced transmission and The Masterwork.
- Added seven-level navigation and a compact Workshop progress overview with honest independent/assisted history and replay.
- Workshop complete now requires all seven completed levels, even when levels are visited out of order.
- Persisted unfinished-attempt assistance, migrated old progress, guarded completion timers, and prevented repeating success dialogs after Keep experimenting.
- Reframed each SVG from stable authored bounds, removed the unused floor divider, improved tray gear legibility and upper socket labels, and retained proportional geometry.
- Added valid-target previews and reasons, two-stage hints, restrained placement acknowledgement and focus-managed dialogs.
- Hardened existing camera cleanup, stale-frame loss handling and released-pinch rearming after reset/navigation/dialog transitions without restarting the camera.
- Explicitly modeled equal-pulley open-belt motion to the output wheel.

## Seven-level progression
Ratios are output speed divided by input speed. Every authored solution was tested through ordinary placement and the real evaluator.

| Level/title | Objective | Learning | Difficulty fit | Solution verified |
|---|---|---|---|---|
| 1 — Connect the machine | Connect input to output | Gaps do not transmit motion; correct sizes must mesh | Two fixed gaps introduce placement | Yes; CCW, 1.2 |
| 2 — Match the direction | Clockwise output | Two external meshes cancel reversals | One idler isolates direction learning | Yes; CW, 1.2 |
| 3 — Reverse the drive | Counter-clockwise output | Count reversals along competing routes | Two plausible routes require planning | Yes; CCW, 1.2 |
| 4 — Trade speed for torque | Half-speed output | Endpoint teeth set ratio; larger driven gear trades speed for ideal torque | Introduces player-chosen output shaft | Yes; CW, 0.5 |
| 5 — Master the workshop | Counter-clockwise, twice-speed output | Combine idlers and endpoint ratio | Clearer single route combines learned rules | Yes; CCW, 2.0 |
| 6 — Advanced transmission | Clockwise, 1.5× output | Choose route parity and endpoint teeth together | Three-idler correct route competes with a two-idler wrong route | Yes; CW, 1.5 |
| 7 — The Masterwork | Counter-clockwise, twice-speed output | Plan fit, direction and ratio across a longer train | Four-idler correct route competes with a shorter three-idler route | Yes; CCW, 2.0 |

## Exact Level 5 adjustment
Removed the upper socket/alternative route, retaining the same lower A/lower B/output-shaft geometry, tray and valid lower solution. The goal still requires a real 32÷16=2 ratio and three external meshes for CCW motion. Its revised objective names the lower route and its first hint starts with endpoint tooth counts. This removes route ambiguity, not the output decision or the actual mechanics.

## Why Levels 6–7 are harder
Level 6 has two physically valid routes with opposite directions; both can achieve 24÷16=1.5, but only four meshes give CW motion. Its correct route requires one more idler than Level 5. Level 7 expands this to four idlers/five meshes, with a plausible three-idler/four-mesh CW alternative. It requires reserving a 16-tooth output and planning successive gap sizes; building both routes locks the train. Duplicate-size gears are separate physical parts, interchangeable wherever the same size fits. No smaller targets, new gestures or hidden timing rules were added.

## Verification
Executed command: `bunx vitest run`.
Latest result: **106 tests passed across 5 files**, including all seven authored solutions, wrong advanced routes, saved-state migration, assistance/history, two-second stable operation, timer cancellation on reset/navigation and pause.

The environment automatically runs its typecheck/production-build pipeline after edits. The latest observed check reported **build OK**. No separate manual `bun run build` or typecheck command was run, and no publish/deploy was performed.

Playwright scripts ran against `http://localhost:8080`:
- `python3 /tmp/browser/release/check_release.py`: desktop sizes, independent Level 1 pointer/keyboard solve, final-level-only ending, progress overview, replay, pause/reset and dialog closing; no page errors.
- `python3 /tmp/browser/release/check_finish.py`: completed all seven through the explicit teaching aid and verified the earned ending, reload history, no camera auto-start, mouse drag, keyboard cancel, touch placement, reduced motion and no horizontal mobile overflow; no page errors.
- `python3 /tmp/browser/release/check_camera_fit.py`: synthetic camera startup/model loading reached Searching for hand; all four target desktop sizes had no page or rail overflow and telemetry remained visible.

Screenshots were inspected for camera layout, running Masterwork, campaign ending, progress overview and mobile play. Browser checks are not a complete accessibility audit.

## Camera limitations and remaining issues
- The sandbox has no physical webcam. Synthetic camera confirms the camera area, startup and model download—not hand aiming, pinch accuracy, real tracking loss or two-hand behavior.
- Real-world hand control must be checked before submission. Keep one hand in view; multiple-hand identity continuity is not guaranteed.
- Older V1 data cannot prove whether an unfinished solution-shaped attempt was independent; such attempts migrate conservatively as assisted, without changing existing independent history.
- Optional sound was intentionally omitted; there is no placeholder audio toggle.
- High zoom/small screens allow scrolling to preserve access. Desktop camera failure hides the unused preview and retains mouse fallback.
- No accounts, backend, rankings, free placement, unrelated features or deployment were added.

## Major changed files
`src/game/config.ts`, `mechanics.ts`, `interaction.ts`, `persistence.ts`, new `campaign.ts` and `campaign.test.ts`, updated `levels.test.ts`, `src/components/steam/Steamworks.tsx`, new `Steamworks.test.tsx`, `Workbench.tsx`, `GearShape.tsx`, `src/hooks/useHandTracking.ts`, `src/styles.css`, `AGENTS.md`, `README.md`, and this release document.

## Three-minute manual release check
1. **0:00–0:30:** Open the game at 1280×720; confirm all seven level buttons, parts, reset and telemetry remain visible.
2. **0:30–1:10:** Open Hand guide, enable camera, show one open hand, pinch one part, release over a socket. Test a closed pinch during Reset and reopen before the next grab.
3. **1:10–1:40:** Move the hand out of view during a grab. Confirm safe cancellation, then camera off. Use mouse or keyboard to place/cancel a part.
4. **1:40–2:15:** Jump to Level 6; use hints or Show solution. Confirm CW direction, 1.50 ratio and stable-running completion. Replay should clear parts without clearing history.
5. **2:15–2:45:** Jump to Level 7; Show solution and confirm CCW/2.00. Workshop complete must appear only if the other six were completed. Open progress; check seven accurate statuses.
6. **2:45–3:00:** Reload. Progress remains, camera stays off. Open/close Settings with Escape and confirm the workbench remains usable.

## 45–60 second demo script
- **0–8s:** “STEAMWORKS is a small engineering game: build a connected machine and learn how gears change direction and speed.”
- **8–20s:** Open Hand guide and enable the physical camera. With one hand visible, pinch a tray gear and release onto Level 1’s first socket. If camera hardware is unavailable, disclose that and demonstrate the same placement with mouse/touch instead.
- **20–30s:** Complete the train with the other input method or explicit Show solution. Show the running piston and output wheel: “A gap stops motion; every external mesh reverses it.”
- **30–45s:** Jump to Level 6 or The Masterwork, use the teaching aid if needed, and point to actual ratio/direction: “The route determines direction; endpoint teeth determine speed.”
- **45–60s:** Open Workshop progress: “Seven directly accessible levels, saved replay history, and independent or solution-assisted completion. The workshop ending is earned only when all seven are complete.”