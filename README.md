# STEAMWORKS

Build a working machine with your hands — and discover the mechanics behind the motion.

A browser-based, simplified gear-train playground. Place gears between a steam-driven input and an output wheel, adjust steam, and watch direction and speed ratio follow from the gears you chose.

## Run
```
bun install
bun run dev      # http://localhost:8080
bun run test     # vitest unit tests
```

## Controls
- **Mouse:** drag a tray gear onto a socket, or click a gear then click a socket. Drag a placed gear to the tray to remove it.
- **Touch:** tap a gear, then tap a socket.
- **Keyboard:** Tab to a tray gear → Enter; Tab to a socket → Enter. Enter on a filled socket picks its gear up. Esc cancels.
- **Hand (opt-in):** move thumb+index to steer the ring cursor, pinch to grab or press a button, release over a socket to place.

## Architecture
- `src/game/config.ts` — authored challenges (sockets, gears, solutions).
- `src/game/mechanics.ts` — meshing/collision checks, BFS motion solve, ratio & direction, hints.
- `src/game/interaction.ts` — shared state machine (pick → drop/cancel) used by every input.
- `src/game/persistence.ts` — validated localStorage.
- `src/game/campaign.ts` — history, navigation bounds, completion counts and stable-running eligibility.
- `src/hooks/useHandTracking.ts` — MediaPipe Hand Landmarker loop.
- `src/components/steam/` — SVG workbench, gear drawing, UI shell.

## Simulation assumptions
Fixed sockets, ideal external spur gears, pitch radius = 5 × teeth / 2. Driven speed = −driver speed × driver teeth ÷ driven teeth. Gears mesh only when centre distance equals the sum of pitch radii (±1.5 px); closer is a collision and is rejected. The steam slider maps linearly to 0–60 input RPM — illustrative, not thermodynamic. Equal-radius shaft pulleys joined by an open belt drive the decorative output wheel 1:1, preserving the output shaft direction; the wheel rim is not the belt pulley.

## Camera privacy
The camera starts only after you press "Enable hand control" and confirm. Frames are processed in the browser and never uploaded or stored. The WASM runtime (jsDelivr) and model file (Google Cloud Storage) are downloaded on first use. The camera never auto-starts after reload.

## Testing & limitations
Seven authored levels; no free-form gear placement. Tests cover each solution, actual ratios/directions, missing connections, wrong advanced routes, jam/collision rejection, assistance restoration, five-level migration, reset/navigation timer cancellation, paused completion, independent history and earned campaign completion. The latest complete suite passed 106 tests. Real browser checks covered mouse click and drag placement, touch, keyboard placement/cancel, replay, pause/reset, saved progress, seven-level completion, dialogs and reduced motion. Desktop gameplay fits 1280×720, 1366×768, 1440×900 and 1920×1080 with camera off and a synthetic camera stream. Synthetic camera startup/model loading reached “Searching for hand”; it does not verify real gestures. Webcam accuracy, two-hand identity continuity and real tracking-loss recovery require hardware checks. Screen-reader support is practical but not audited.

## Local progress migration
The existing `steamworks:v1` storage key is retained, with version 2 inside the saved payload. Versions 1 and 2 are accepted. Levels 1–4 history and compatible placements remain; incompatible old Level 5 placements clear only its attempt. Historical Level 5 completion remains. V1 did not record unfinished attempt assistance, so uncompleted solution-shaped attempts migrate conservatively as assisted. Version 2 stores assistance for each attempt. Replay/reset clears only the current attempt; independent completion cannot be downgraded. All seven levels are directly accessible.

## AI-development disclosure (editable)
This game was developed with AI assistance through Lovable. Known tools used include coding assistance, read-only background code/mechanics investigation, Vitest, and Playwright browser checks. Media is authored SVG, not generated photography. Update this section with any additional tools or contributor details before submission; no claim is made that the project was created without AI assistance.

## Release notes
See `RELEASE.md` for progression, verification scope, limitations, a three-minute release checklist and a 45–60 second demo script.

## Third-party
@mediapipe/tasks-vision (Apache-2.0) and its hand_landmarker model; Google Fonts: Big Shoulders Display, IBM Plex Sans/Mono (OFL). All artwork is drawn in SVG code.
