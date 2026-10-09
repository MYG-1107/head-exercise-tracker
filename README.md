# Head Movement Tracker — Privacy-First Update

A static website for tracking gentle head-movement cycles. It works on GitHub Pages and has two modes:

- **Camera mode:** uses MediaPipe Face Mesh inside the browser to estimate head direction. A repetition is counted only after a detected direction and a return to centre. The user must explicitly start the session and calibrate a neutral position.
- **Manual mode:** does not request camera permission or load the camera-tracking libraries. The user records a cycle after completing it and returning to centre.

This is a prototype for personal movement awareness—not a medical device, diagnosis, exercise prescription or clinically validated rehabilitation product.

## What's in this package

| File | Purpose |
| --- | --- |
| `index.html` | Responsive app interface, camera/privacy notice, safety guidance and accessible dialogs |
| `style.css` | Responsive styling, zoom/scroll support, keyboard focus and reduced-motion support |
| `script.js` | Camera lifecycle, on-demand library loading, calibration, timer, manual mode and UI events |
| `tracker-core.js` | Framework-free repetition-counting and pose-classification logic |
| `favicon.svg` | Updated site icon |
| `robots.txt` | Search-engine crawl instructions |
| `sitemap.xml` | Sitemap for the GitHub Pages URL |
| `tests/tracker-core.test.js` | Automated tests for repetition state logic |
| `package.json` | Built-in Node.js test commands; no npm dependencies required |
| `CHANGELOG.md` | Summary of the privacy-first changes |

## Deploy on GitHub Pages

1. Download and extract the ZIP.
2. Open the repository: <https://github.com/MYG-1107/head-exercise-tracker>.
3. Upload the extracted files and folders to the **repository root**, replacing the files with the same names. Keep the `tests/` folder and the new `tracker-core.js` file.
4. Commit the changes to the branch configured for GitHub Pages (the current setup uses `main` and the repository root).
5. Open <https://myg-1107.github.io/head-exercise-tracker/> and hard-refresh the browser.

No build step, backend, API key, database, or package install is needed to run the static site.

## Privacy model

- The app has no login, analytics code, cookies, local-storage session history, database, or image-upload implementation.
- Camera permission is requested only when the user starts camera mode.
- The app passes camera frames to the in-browser MediaPipe pipeline and does not intentionally upload or persist camera frames.
- MediaPipe scripts and model assets are loaded from version-pinned jsDelivr URLs only when camera mode is started. The CDN may receive ordinary request metadata. The app cannot guarantee the behavior of third-party code served by an external provider; users with stricter requirements should self-host and review the complete dependency and model assets.
- Session counts and elapsed time live only in page memory. Refreshing or closing the page clears them.
- Voice prompts are off by default and use browser speech synthesis; the app does not request microphone audio.

## Camera tracking notes

The direction estimate uses relative facial landmarks and a neutral calibration baseline, smoothing and a short stable-frame requirement. It is a heuristic, not a clinical head-pose measurement. Performance can vary with lighting, camera angle, device and individual movement. Use the manual mode if tracking does not behave reliably. The left/right labels and thresholds should be validated on a representative set of browsers and devices before describing tracking accuracy publicly.

Camera mode requires a secure browser context and camera permission. GitHub Pages normally provides HTTPS. If the tracking library/model cannot be loaded, use manual mode or retry when connected.

## Test locally

Install a current Node.js release, then run:

```bash
npm test
```

Or run the syntax checks and tests together:

```bash
npm run check
```

These automated tests validate the pure repetition-counting logic only. They do not test real webcam accuracy, browser permissions, external CDN availability, mobile rendering, or clinical safety. Use the manual checklist below after deployment.

## Post-deployment checklist

- [ ] Start camera mode; ensure browser permission is requested only after the button is pressed.
- [ ] Deny camera permission; confirm a readable error and that manual mode remains available.
- [ ] Calibrate while looking straight ahead; confirm the 45-frame progress completes.
- [ ] Test direction → centre cycles; each full cycle should count at most once.
- [ ] Switch from one off-centre direction directly to another; it should not count a repetition.
- [ ] Move out of frame during an unfinished cycle; it should not later count as complete.
- [ ] Pause the session; confirm the camera indicator turns off and camera tracks are released.
- [ ] Open browser DevTools → Network; verify this app makes no image-upload request. Camera mode will request the version-pinned scripts and model assets from jsDelivr.
- [ ] Use manual mode; confirm the app does not request camera access or load MediaPipe dependencies.
- [ ] Test on a phone in portrait and landscape, with browser zoom enabled and keyboard-only navigation.
