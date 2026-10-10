# Validation report — Head Movement Tracker v2.3

Date: 10 October 2026

## Automated checks run

- `node --check script.js` — passed.
- `node --check tracker-core.js` — passed.
- `npm test` — 10 tests passed, 0 failed.
- HTML source parsed with Python's built-in HTML parser — passed.
- Duplicate HTML IDs — none found.
- Static JavaScript `$('id')` references — all resolve to HTML IDs.
- Local `script` / `stylesheet` / `favicon` assets — all exist.
- CSS brace balance — passed.
- Flip, Voice and Reset buttons — all exist and have descriptive `aria-label` values and titles.
- Application files checked for Cloudinary/upload endpoints and browser persistent-storage APIs — no references found.
- App state is held in JavaScript memory; the app does not write session data to storage.

## Manual checks still required after deployment

This environment did not run a physical webcam or complete cross-browser automation, so the following are not claimed as passed:

- Camera permission, real MediaPipe asset delivery, and actual face tracking.
- Count accuracy for a representative group of people, lighting conditions and devices.
- Camera flip/start/pause/stop timing on desktop and mobile.
- Keyboard/screen-reader acceptance testing and zoom/responsive inspection.
- Independent privacy/security review or any clinical/regulatory validation.

See `VALIDATION-CHECKLIST.md` for the post-deployment acceptance procedure. Do not describe the app as clinically validated or as a medical device.

## External dependencies

- Source Sans 3 is loaded from NAV's public CDN to follow the requested typography. This makes a standard font request before camera use.
- Camera mode loads version-pinned MediaPipe Face Mesh code/model assets from jsDelivr only after Start is selected.
- No app-level code uploads images, sends camera frames to a server, or persists counts. Third-party CDNs can receive normal connection metadata.
