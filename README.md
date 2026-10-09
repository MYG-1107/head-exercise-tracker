# Head Movement Tracker v2.1 — focused live tracker

This is a static GitHub Pages app for personal movement awareness. The main view prioritizes the camera preview, a live direction prompt and repetition counters. Camera-mode calibration begins automatically when a face appears; a visible Recalibrate button remains available. Manual mode works without camera permission.

## Deploy
1. Extract the ZIP.
2. Upload all files/folders to the root of `MYG-1107/head-exercise-tracker`, replacing files with the same names.
3. Commit to the branch configured for GitHub Pages (currently `main`, repository root).
4. Hard-refresh `https://myg-1107.github.io/head-exercise-tracker/`.

No build step, account, API key, or npm install is needed to serve the site. For local validation, install Node.js and run `npm run check`.

## Privacy
- No image-upload code, analytics, login, cookies, database, localStorage, or persistent session history.
- Camera permission is requested only when the user starts camera mode.
- Frames are passed to the MediaPipe library running in-browser. MediaPipe scripts and model assets are downloaded from version-pinned jsDelivr URLs only in camera mode; CDN requests may expose ordinary connection metadata. The app cannot independently guarantee the behavior of third-party code. For stricter privacy, self-host and review all dependency/model assets.
- Counts and time remain in page memory and clear on reload/close. Voice prompts are off by default and use browser speech synthesis; no microphone is requested.

## Tracker logic
The counter records a camera repetition only after a stable direction is detected and the tracker subsequently detects a stable return to centre. A direct switch from one direction to another does not count. Calibration uses 45 frames after automatic startup and lower starting thresholds than v2.0; individual camera/lighting differences still require real-device validation. Use manual mode if the camera tracker is unreliable.

## Important limitations
This is a heuristic prototype, not a medical device, diagnosis, exercise prescription, or clinically validated rehabilitation tool. It does not measure clinical range of motion or determine what movement is appropriate for an individual. Move comfortably and stop for pain, dizziness, numbness, or other concerning symptoms.

## Validation checklist
- [ ] Start camera mode and verify camera access is requested only after the click.
- [ ] Confirm automatic calibration progress appears when a face is detected.
- [ ] Keep a neutral position still until the calibration state says ready.
- [ ] Move centre → one direction → centre and verify the matching counter increments once.
- [ ] Try direct left-to-right switching; it must not count.
- [ ] Confirm live direction guidance changes while moving.
- [ ] Pause/stop and confirm the browser camera indicator turns off.
- [ ] Use DevTools Network: confirm no image-upload request; expect version-pinned MediaPipe assets from jsDelivr in camera mode.
- [ ] Select manual mode and verify no camera access or MediaPipe loading occurs.
- [ ] Check desktop/mobile, keyboard focus, enlarged text and denied camera permission.

Automated Node tests verify core counting/classification rules only. They cannot prove webcam accuracy or cross-device reliability.
