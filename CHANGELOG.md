# Changelog

## 2.2.0 — Release-candidate validation and lifecycle fix

- Simplified the main screen so video, live direction and counts are the focal point.
- Fixed missing DOM IDs that could throw during initial UI rendering.
- Removed the MediaPipe Camera helper in favour of one explicit camera stream and one owned frame-processing loop; avoids competing camera-acquisition paths.
- Added stale-start guards and cleanup for permission/model-loading races.
- Added safe shutdown on frame-processing failures.
- Tightened calibration stability checks and used separate direction-entry and neutral-exit thresholds.
- Added unit tests and a browser smoke page for manual tracking and session controls.
- Preserved the privacy-first model: no image uploads, analytics, account, cookies or persisted session data.

## 2.1.0 — Previous iteration

- Reduced homepage content and added live direction feedback, automatic calibration and a compact counter layout.
- Kept manual mode and local-only session state.

## 2.0.0 — Privacy-first baseline

- Removed the historical silent camera-image upload function and Cloudinary integration.
- Added manual tracking, session controls, per-direction caps, privacy notes and automated tracker tests.
