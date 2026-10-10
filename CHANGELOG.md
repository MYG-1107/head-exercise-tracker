# Changelog

## v2.3 — Simpler, clearer controls

- Simplified the page into one main tracker view.
- Made the camera preview and live direction the main focus.
- Added icon buttons with visible short labels for Flip, Voice and Reset; each icon button also has an accessible name and title.
- Used Source Sans 3 from NAV's public font CDN and short, clear content inspired by public-service accessibility principles; no UDI/NAV branding or unrelated copy was reproduced.
- Added a responsive layout, visible keyboard focus, browser zoom support and reduced-motion support.
- Kept camera access opt-in and removed image uploads, analytics and persistent session storage.
- Added start-attempt cancellation handling, single-stream ownership, frame-loop cleanup and camera release on pause/stop/reset/completion.
- Kept directional repetition counts dependent on a completed movement-to-centre cycle, with neutral reacquisition after face-tracking interruption.
- Added automated counting/classifier test cases and a post-deployment acceptance checklist.
