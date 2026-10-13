# QA and SEO validation report — v2.4.0

Date: 2026-10-13

## Automated checks

The release check suite now has 20 automated tests (unit, static-site and simulated DOM smoke tests). It includes:

- JavaScript syntax checks for `script.js`, `tracker-core.js` and `sw.js`.
- Unit tests for movement-cycle state, direct direction switches, interrupted tracking, goal limits, manual entries, completion, reset and pose classification.
- Static tests for unique IDs and DOM references, unique metadata/canonical URLs, sitemap inclusion, internal links, privacy-sensitive API references, manifest and service worker configuration.
- Manual validation checklist for camera/device, responsive, offline and SEO acceptance.

Run `npm run check` from the repository root. Run the browser smoke test after deployment.

## Privacy review

- No image-upload APIs or `fetch`, XHR, or sendBeacon calls in app JS.
- No localStorage/sessionStorage/cookie use for session counts.
- CSV is generated only after a user clicks Export summary; it is not uploaded.
- Service worker caches same-origin static application files only; cross-origin requests are not intercepted/cached by this worker.
- The user-facing privacy page discloses NAV font and jsDelivr model requests and offline app-shell caching.

## SEO review

- Unique title, meta description and canonical on the home, guide, privacy and safety pages.
- Open Graph/Twitter metadata, WebApplication JSON-LD and social preview image.
- Crawlable HTML links, updated robots.txt and sitemap with canonical URLs.
- Separate support pages keep the homepage short while answering real questions.

## Limitations

This report does not certify camera detection accuracy across devices, legal compliance, clinical effectiveness or top search placement. These require physical-device/user testing, careful product review, and monitoring in Search Console after deployment.
