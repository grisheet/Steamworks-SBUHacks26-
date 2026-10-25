<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Game logic lives in pure modules under `src/game/` (config, mechanics, interaction reducer, persistence) — keeps the simulation testable without rendering.
- All input methods (pointer, touch, keyboard, hand) dispatch the same `interactionReducer` actions — no per-input puzzle variants.
- Gear meshing is computed from fixed socket geometry (pitch radius = module × teeth / 2); add new layouts as authored challenge data, never free placement.
- Animation writes SVG transforms via refs in one rAF loop; React state is not updated per frame.
- MediaPipe is dynamically imported inside the hand-tracking effect so SSR never loads it.
- A challenge may declare `outputSocket`; then the player-chosen gear in that socket drives the output wheel (via `outputGearId`), so ratio goals are real choices without free placement.
- Level switch and "Reset level" share one transient clean-up path (grab, preview, success timer, overlay, animation phase) and never touch camera state or other levels' progress.
- Campaign completion/history and hold eligibility live in `src/game/campaign.ts`; saved attempts persist assistance separately from historical completion and migrate older versions on read — prevents reloads and replay from promoting assisted attempts or downgrading independent solves.
- Gesture invalidation uses a live token without restarting the camera; modal transitions re-arm the released-pinch gate and isolate gameplay — preserves a single camera session and safe grabs.
- SVG framing uses stable gear/socket/label bounds and DOM-based hit testing — resizing must not distort geometry or separate visible targets from input.
- The output wheel uses equal-radius shaft pulleys with an open 1:1 belt and `outputWheelMotion` — visual tangents and motion must preserve output gear speed and direction, independent of the decorative rim size.
