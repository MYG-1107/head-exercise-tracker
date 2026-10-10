# Head Movement Tracker — Final Replacement Package 2.2

A small static website for tracking gentle head-movement cycles. It is designed for GitHub Pages and intentionally focuses the home screen on the live video, current direction, repetition counts and session controls.

## Deployment

1. Extract this ZIP.
2. Open <https://github.com/MYG-1107/head-exercise-tracker>.
3. Upload the ZIP contents to the repository root, replacing files with matching names. Keep `tracker-core.js`, `tests/`, and `validation/`.
4. Commit to the branch configured for GitHub Pages (the current repository setup uses `main` and the root folder).
5. Open <https://myg-1107.github.io/head-exercise-tracker/> and perform a hard refresh.

This is a static site. It requires no server-side API, credentials, build step or database. `npm install` is not required.

## Product changes in 2.2

- Removed introductory/marketing blocks from the main flow; the video and live tracker take priority.
- Removed the MediaPipe `Camera` helper and now acquire the webcam through one `getUserMedia()` call and one owned frame loop. This avoids two independent camera-acquisition paths.
- Requests camera permission only after the user selects Start in camera mode.
- Loads the version-pinned MediaPipe Face Mesh script/model only after starting camera mode. Manual mode does not load the CDN.
- Automatically calibrates when a face first becomes visible, with progress feedback; recalibration is available.
- Counts a camera repetition only after a stable direction is followed by a stable return to centre.
- Uses separate enter/exit thresholds (hysteresis) to reduce flicker near neutral.
- Cancels incomplete movement cycles if the face is lost, and stops tracking safely when frame processing throws an error.
- Includes manual mode, optional voice prompts (off by default), short configurable goals, pause/resume, stop and reset controls.
- Session counts and elapsed time stay in page memory. No account, analytics, image upload or persistent session history is implemented.
- Includes unit tests and a same-origin browser smoke-test page.

## Privacy model

- The app has no login, analytics SDK, cookies, local-storage writes, database or image-upload function.
- Session counts and elapsed time exist in JavaScript memory only and clear on refresh/close.
- Camera permission is requested only when Start is pressed in camera mode.
- Video frames are passed from the one active camera stream to MediaPipe running in the browser. Camera mode downloads version-pinned third-party JavaScript and model assets from jsDelivr. The CDN can receive ordinary connection metadata; as with any third-party code executing in a page, this dependency should be reviewed before making stronger security guarantees.
- Manual mode never requests camera permission and does not load MediaPipe.
- The app does not use microphone input. Optional voice output uses browser speech synthesis.

For the strongest privacy/supply-chain boundary, vendor the MediaPipe script and every associated model/WASM asset into this repository, verify versions and integrity, and then remove the CDN dependency. This release does not claim to have completed that vendor/security-audit step.

## Run source-level checks

With a current Node.js release:

```bash
npm run check
```

The 10 automated unit tests cover state-machine counting, false counts on direct direction changes, interrupted movement, goal completion/capping, manual mode, pose thresholds and malformed input.

## Run the browser smoke test

Start a local static server from the extracted folder:

```bash
python -m http.server 8000
```

Open <http://localhost:8000/tests/browser-smoke.html>. It exercises the actual page in an iframe and checks:

- the app initializes without a missing-element error;
- the camera is off on page load;
- manual mode starts without loading MediaPipe/CDN resources;
- a manual direction count updates the total and per-direction count live;
- pause, resume, stop and reset work;
- the privacy dialog opens and closes.

This test does not validate actual face tracking. It does not request a real camera.

## Post-deployment real-camera checklist

- [ ] Start camera mode; grant permission only after Start is pressed.
- [ ] Confirm the camera LED/browser indicator turns on once and turns off after Stop, Pause and completion.
- [ ] Wait for automatic calibration to finish while sitting still and looking towards the camera.
- [ ] Test one gentle movement in each direction and return to neutral; verify exactly one count per complete cycle.
- [ ] Switch directly between two off-centre directions; it must not count a completed repetition.
- [ ] Move out of frame mid-cycle; it must not count.
- [ ] Deny camera permission; verify the error is readable and manual mode still works.
- [ ] Disable internet after the page loads and start camera mode; verify the CDN failure message and manual fallback are understandable.
- [ ] Open DevTools → Network. Confirm there are no image-upload requests. Camera mode should request only the pinned MediaPipe script/model assets from jsDelivr.
- [ ] Test pause/resume, camera flip, reset, stop, and a completed goal; verify one active camera stream and timer state at each transition.
- [ ] Test on at least one desktop webcam and one mobile device, in different lighting and camera angles.
- [ ] Verify left/right means the displayed preview's screen direction on each supported camera.

## Limitations

This is a prototype, not a medical device or validated physiotherapy application. The face-landmark heuristic can behave differently with camera angle, lighting, movement style and device performance. The unit tests validate deterministic program logic; they are not proof of tracking accuracy or clinical benefit. If live detection is not reliable, stop camera tracking and use manual mode.
