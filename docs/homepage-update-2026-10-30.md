# Homepage update · 2026-10-30

The temporary DIVEROID homepage now leads with WatchDive, using an off-white background, black rules, bold typography, the brand blue and square buttons. Season 2 signup and support remain available.

- Korean WatchDive destination: https://watchdive.diveroid.com/ko (redirects to `/ko/scuba`).
- English WatchDive destination: https://watchdive.diveroid.com/ (redirects to `/scuba`).
- Both hiring entry points use `data-ko-only`; JavaScript toggles `hidden`, and an English-language CSS rule prevents a recruiting flash before initialization.
- Locale priority: valid `?lang=ko|en`, then the existing `sessionStorage.lang`, then Korean. Switching language updates the query parameter and accessible pressed state.
- The existing subscription API and request payload are retained. The frontend now uses the same-origin endpoint and checks `{ success: true }`, with pending, success and retry states.
- `/hiring/`, `/support/`, `/privacy/`, `/app/`, the API implementation and domain configuration are unchanged. Legal company details remain hidden under the existing setting.

## Sources and assets

Product copy was checked against the official WatchDive Korean and English pages on 2026-10-30. Availability is described as pre-launch. Pricing, launch dates and detailed compatibility are deferred to the product page.

- Actual underwater photograph: `https://watchdive.diveroid.com/assets/scuba-1280-DisdKaeL.webp`, copied unchanged to `assets/images/watchdive-scuba.webp` (31,384 bytes).
- Product wordmark: `https://watchdive.diveroid.com/assets/watchdive-wordmark-white-B-2kpJ17.svg`, displayed in black on the light background.
- Existing DIVEROID wordmark: `/hiring/brand-kit/diveroid-wordmark-white.png`.
- Brand communication reference: https://hub.diveroid.com/brand-system/communication/index.html (2.6.1).

## Verification

- Browser checks at 320, 390, 768, 1024 and 1440 CSS pixels in both languages: no horizontal overflow or broken images; two recruiting elements in Korean, none visible in English.
- Desktop and mobile screenshots reviewed. Accessible headings, form labels and language selection checked.
- Query-string locale precedence and switching back to Korean checked.
- Signup success, HTTP failure, unexpected success payload, network failure, duplicate prevention and language changes during submission checked using browser-local mock responses. No test email was written to the live database; end-to-end email storage was not tested.
- JavaScript syntax, duplicate HTML IDs, local asset paths, WatchDive destination HTTP 200 after redirects and `git diff --check` passed.

## Rollback

The previous production commit is `b67b84ab2e8a589a2bce54b7ffb36bccdb983a3d`. Revert the homepage update commit and push to `main` to redeploy the prior homepage without changing unrelated endpoints.
