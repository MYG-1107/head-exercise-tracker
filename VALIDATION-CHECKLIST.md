# Post-deployment acceptance checklist

Run these tests on the deployed site. Passing the unit tests alone does not establish real webcam accuracy.

## Simple user experience
- [ ] The first screen focuses on video, current direction, total count and four directional counts.
- [ ] Flip, Voice and Reset each show a clear symbol and short label.
- [ ] Voice starts off. Toggling it changes both the visible state and accessible name.
- [ ] Reset clears counts and time, and releases camera tracks.
- [ ] Manual mode works without a camera permission prompt.

## Camera and live count
- [ ] Browser asks for camera permission only after Start is pressed.
- [ ] Denied permission shows a readable message; manual mode remains available.
- [ ] After a face is detected, automatic calibration progress appears and completes while looking comfortably toward the camera.
- [ ] Move one direction and return to centre: exactly one count updates without refreshing.
- [ ] Holding a direction does not repeatedly increment counts.
- [ ] Switching directly between directions without a stable centre does not count a repetition.
- [ ] Losing the face during an unfinished movement does not count it; after reacquisition, return to centre first.
- [ ] Flip stops the existing track, connects the new camera, and calibrates again.
- [ ] Pause, Stop and Reset turn off the browser's camera-use indicator.
- [ ] Finish the selected goal, start a new session, and verify counts and elapsed time.

## Privacy and accessibility
- [ ] DevTools Network shows no image-upload request. The font is loaded from NAV's public CDN. Camera mode loads MediaPipe assets from jsDelivr only after Start.
- [ ] Reload clears counts and elapsed time.
- [ ] Test keyboard-only navigation and visible focus; test browser zoom at 200%.
- [ ] Test phone portrait/landscape and narrow desktop widths.
- [ ] Verify text does not claim diagnosis, clinical accuracy, range-of-motion measurement or treatment.

## Release criteria

Before calling the product ready for public use, test at least one desktop webcam and one mobile browser, record false-positive and missed-repetition rates across repeated cycles, and conduct accessibility and privacy review. Do not market it as diagnosis, treatment or rehabilitation software without appropriate clinical, security and regulatory review.
