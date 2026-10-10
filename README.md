# Head Movement Tracker — Simple v2.3

A small static app for tracking gentle head-movement cycles. It is designed for GitHub Pages and has two modes:

- **Camera mode:** MediaPipe estimates direction in the browser after the user starts the session. A camera repetition counts only after moving from centre to one direction and returning to centre.
- **Manual mode:** the camera is not requested. The user taps a direction after completing a cycle themselves.

This is a personal movement-tracking prototype, not a medical device, diagnostic system, physiotherapy prescription, or clinically validated treatment tool.

## What's included

- `index.html` — short, simplified interface with labelled icon buttons.
- `style.css` — responsive layout, large touch targets, zoom support, focus outlines, reduced-motion support.
- `script.js` — camera lifecycle, calibration, session controls and UI updates.
- `tracker-core.js` — pure repetition logic and pose classification.
- `favicon.svg`, `robots.txt`, `sitemap.xml` — site assets and crawl files.
- `tests/tracker-core.test.js` — automated tests for counting logic.
- `package.json` — built-in Node.js test commands.
- `CHANGELOG.md`, `VALIDATION-CHECKLIST.md` — changes and deployment tests.

## Deploy on GitHub Pages

1. Extract this package.
2. Open <https://github.com/MYG-1107/head-exercise-tracker>.
3. Upload all package contents to the repository root, replacing same-named files. Keep `tracker-core.js` and the `tests/` folder.
4. Commit to the branch configured for GitHub Pages (currently `main`).
5. Hard-refresh <https://myg-1107.github.io/head-exercise-tracker/> after deployment.

No build process, server, account, database, or API key is needed.

## Typography and content approach

The interface uses the Source Sans 3 typeface documented in NAV's public design system and follows the general accessibility principles described by UDI: clear hierarchy, keyboard navigation, relative type sizing and short, understandable wording. It does not copy either organisation's branding or unrelated service copy. Source: <https://aksel.nav.no/grunnleggende/styling/typografi> and <https://www.udi.no/en/about-the-udi/about-the-website/>.

For the requested typeface, the browser requests the font from NAV's public CDN. Camera mode requests the version-pinned MediaPipe script and related model assets from jsDelivr after the user selects Start. Those providers can receive ordinary connection metadata, such as IP address and browser request details. For the most restrictive privacy requirement, replace the external font with a system-font stack and self-host/review the full MediaPipe code/model assets before release.

## Privacy model

- There is no image-upload function, analytics, login, cookie-based tracking, or persistent session history in this version.
- Camera permission is requested only after the user selects Start in camera mode.
- Camera frames are passed to the MediaPipe pipeline in the browser. The code does not intentionally upload or save camera frames.
- Pause, stop, reset and completed sessions release the camera tracks.
- Manual mode does not request camera access and does not load the MediaPipe script.
- Counts and elapsed time exist in page memory only and clear on reload.
- Voice is off by default and uses browser speech synthesis only; microphone audio is not recorded.

## Test locally

Install a current Node.js release and run:

```bash
npm run check
```

These tests validate syntax and the pure counting/classification logic. They do not prove real-world camera accuracy, browser permission behavior, CDN availability, accessibility compliance, or medical effectiveness.

## Health and safety

Move only within a comfortable range. Stop if movement causes pain, dizziness, numbness, or other concerning symptoms. Seek advice from a qualified healthcare professional when needed. The app estimates direction from facial landmarks; it does not measure clinical range of motion, assess technique or diagnose a condition.
