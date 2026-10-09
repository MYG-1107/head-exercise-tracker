# Changelog

## v2.1.0 — 2026-10-09
- Reworked the home screen into a compact tracker-first layout.
- Made the live direction prompt and four repetition counters prominent beside/under the camera.
- Added automatic visible neutral calibration after a face is detected, removing the calibration-button bottleneck that left sessions running at zero.
- Kept a manual Recalibrate action and added clearer per-frame direction guidance.
- Lowered initial landmark thresholds and expanded pure logic tests; these are starting values and still require real webcam validation.
- Simplified secondary UI and retained privacy/safety in dialogs.
- Continued to avoid image uploads, analytics and persistent session storage.
