# Head Exercise Tracker — QA & SEO Update v2.4

A small, static GitHub Pages web app for counting head-movement cycles. The home screen stays focused on the video, live direction, repetitions and session controls.

## User features

- Optional camera-assisted head-direction tracking with neutral calibration.
- Manual mode when a user does not want to use a camera or tracking is unreliable.
- Voice prompts that are off by default, plus Flip camera and Reset controls.
- Downloadable CSV session summary; export is triggered by the user and is not uploaded.
- Installable app shell and offline manual mode after the site has been loaded and cached once.
- Short, crawlable guide, privacy and safety pages.

## Deploy

1. Extract the replacement ZIP.
2. Upload **all files and folders** to the root of `MYG-1107/head-exercise-tracker`, replacing files with matching names.
3. Keep `guide.html`, `privacy.html`, `safety.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `social-card.png`, `tracker-core.js`, and `tests/`.
4. Commit to `main` and wait for GitHub Pages to publish.
5. Hard-refresh the deployed page and run `VALIDATION-CHECKLIST.md`.

No build step or package installation is required to run the website. For tests, use Node.js and run `npm run check`. The suite includes unit tests plus a lightweight DOM smoke test for manual mode and CSV export; it does not substitute for real camera testing.

## Privacy

- No account, analytics, cookies, app database, session-history storage, photo upload or video upload feature.
- Camera permission is requested only when camera mode is started.
- MediaPipe scripts and model assets are loaded from jsDelivr only after the user chooses camera mode. The Source Sans 3 font is loaded from NAV's public CDN. These providers can receive standard request metadata.
- The service worker caches static app files for offline loading. It does not cache camera frames or counts.
- Session values stay in page memory until reload/close. A CSV file is created only when the user explicitly chooses Export summary; sharing that file is the user's choice.

## Medical limitations

This is a movement counter prototype, not a medical device, diagnosis, exercise prescription or physiotherapy plan. Camera estimates may be wrong; manual entries are self-reported. Do not make treatment claims. Stop if an activity causes pain, dizziness, numbness or concerning symptoms and seek professional advice where appropriate.

## SEO notes

The site includes unique page titles/descriptions, canonical URLs, crawlable links, JSON-LD, Open Graph metadata, a sitemap and robots.txt. Submit the sitemap in Google Search Console and Bing Webmaster Tools after deployment. These improvements help discovery and understanding but cannot guarantee indexing or top rankings. See `SEO-SETUP.md`.
