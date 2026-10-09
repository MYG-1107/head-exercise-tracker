# Changelog

## 2.0.0 — Privacy-first product update

- Removed Cloudinary configuration, silent photo capture, canvas image encoding and all app-level image-upload calls.
- Made camera permission an explicit user action rather than a page-load behavior.
- Made MediaPipe script loading on-demand and pinned the library URLs to explicit versions.
- Added a privacy notice that explains the third-party CDN dependency and ordinary connection metadata instead of claiming that no external provider is contacted.
- Added a manual mode that does not request camera permission or load the tracking libraries.
- Added neutral-position calibration, smoothed relative landmark estimates and a stable-frame debounce.
- Changed the camera counter to require direction → centre cycles; a direct switch between non-neutral directions is not counted.
- Added pause/resume/end/reset states and releases the camera when paused, ended or completed.
- Made voice prompts opt-in and kept session counts in page memory only.
- Reworked the layout for mobile, browser zoom, keyboard focus, reduced motion and accessible native dialogs.
- Added clearer safety limitations and configurable per-direction goals (3, 5, 8 or 10). Goals are tracking settings, not medical recommendations.
- Added Node.js unit tests for the core counting and pose-classification functions.
