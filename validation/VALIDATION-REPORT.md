# Validation report — Head Movement Tracker 2.2.0

Date: 2026-10-10

## Repository audit findings

The current `main` source inspected during this audit had these file versions:

- `index.html`: `c46b4d0dbabd80588448400df78f2cf0d09a7f42`
- `script.js`: `05c4af63409dfce8612327d1b24c0d7b4f84c7d1`
- `tracker-core.js`: `eb6bfb08fedd35e63b8a6f6d85e356ba11d673a6`

The existing camera-start flow first calls `navigator.mediaDevices.getUserMedia()` and then starts MediaPipe's `Camera` helper. The helper manages camera access itself, so this creates two camera-acquisition paths for the same video element and complicates stream ownership/release. Version 2.2 removes the helper and uses one explicit stream plus one cancellable frame loop.

The public page could not be opened by the browsing renderer during this audit. The conclusions about the current code are from the repository source, not a claim of a successful remote live-page run.

## Automated and static checks completed

- JavaScript syntax checks: `script.js` and `tracker-core.js` pass `node --check`.
- Unit tests: 10 tests pass with `node --test tests/tracker-core.test.js`.
- DOM reference consistency: all 36 static ID lookups in `script.js` match elements in `index.html`.
- HTML ID uniqueness: 56 IDs, with no duplicates.
- CSS parsing: 133 top-level/at-rule entries parsed with `tinycss2`; no stylesheet/declaration parse errors.
- Local asset references: `favicon.svg`, `style.css`, `tracker-core.js`, and `script.js` exist.
- Sitemap and favicon: both XML documents parse.
- Camera lifecycle static check: one application `getUserMedia()` call site; no MediaPipe `Camera` helper or `camera_utils` dependency.
- Privacy static scan: no Cloudinary, `fetch()`, XHR, browser storage, IndexedDB, beacon or application image-upload code in `script.js`.
- Network behavior by design: the HTML has no eager remote script tags; the pinned Face Mesh script/model is requested only after camera mode is started. Manual mode does not load that dependency.

## Not claimed as passed

- Camera direction detection accuracy with a physical webcam.
- Camera permission denial, track/indicator release, device switching and frame-rate performance on multiple browsers/devices.
- Automated browser smoke run in this environment. Playwright/Chromium navigation was rejected with `ERR_BLOCKED_BY_ADMINISTRATOR` for local file and localhost URLs. The included `tests/browser-smoke.html` must be run by opening it from a local server in a normal browser.
- Third-party dependency security review, independent privacy audit or clinical validation.

## Acceptance checklist before calling camera tracking production-ready

1. Run `npm run check`.
2. From the project root run `python -m http.server 8000`, then open `http://localhost:8000/tests/browser-smoke.html`.
3. Try the camera flow with a real desktop webcam and a phone: start, automatic calibration, all four directions, return to centre, pause/resume, flip, stop and reset.
4. Confirm the camera indicator turns off on pause/stop/completion and check DevTools → Network for zero image-upload requests.
5. Confirm the app counts one completed direction-to-centre cycle exactly once and that face loss cancels any unfinished cycle.
6. Review or self-host the MediaPipe script and all model/WASM assets before making a strict third-party supply-chain/privacy guarantee.
