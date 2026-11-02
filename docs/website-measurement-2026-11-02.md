# DIVEROID website measurement

Scope: the `www.diveroid.com` homepage and its Season 2 email form. WatchDive's existing conversion definitions remain separate. Static frontend: GitHub Pages; signup API: `https://diveroid-landing.vercel.app/api/subscribe` on Vercel.

## Public tag configuration

`assets/js/measurement-config.js` contains public IDs verified against WatchDive production on 2026-11-02:

| Provider | ID | Events on DIVEROID |
| --- | --- | --- |
| Google Analytics 4 | G-JFZR7BHTQ3 | `page_view`, `diveroid_season2_signup`, `diveroid_outbound_click` |
| Meta | 1028181916616055 | `PageView`, custom `DiveroidSeason2Signup` |
| TikTok | Not created yet | Adapter prepared: `page`, `SubmitForm`; no SDK loads with a blank ID |

Use the existing GA4 property's **Host name = www.diveroid.com / diveroid.com** to distinguish this homepage from WatchDive. The GA4 signup event is deliberately separate from WatchDive. The fixed `destination` on outbound clicks is `watchdive`, `press_kit` or `creator_partnerships`.

In Meta Events Manager use the dataset above and the custom event `DiveroidSeason2Signup`. We do not send the standard WatchDive `Lead`, `CompleteRegistration` or `Purchase` events for this form. No monetary value is invented. The signup is not email-verified.

Google Ads conversion labels are not copied from WatchDive. Marking the new GA4 event as a key event, importing it into an Ads account, or creating a Meta custom conversion is an account-side follow-up once the owner selects the desired campaign conversion. Browser tags alone do not make an Ads conversion action.

TikTok: the owner confirmed no existing pixel. The Ads Manager browser is at login, so account access is required to create the dataset. After login, create a website pixel for DIVEROID with manual code, keep automatic form/advanced matching off, put the actual pixel ID in `measurement-config.js`, bump its import version, test consent + successful `SubmitForm`, then deploy. Do not use a placeholder ID or enable account-side automatic form scraping. No advertising spend or campaigns are created by this change.

## Consent and data

The homepage offers equally available Allow all / Essential only / Choose controls in Korean and English. Analytics and advertising can be chosen separately. Default is off everywhere. GPC/DNT override grants. Preference TTL: 180 days. On permission changes after an SDK is loaded, consent is revoked and the page reloads to remove SDK listeners. Users can reopen settings in the footer. No raw or hashed email is passed to ad/analytics SDKs. No session replay, fingerprint, GPS, contacts, phone or inferred demographics.

Analytics-only does not forward ad click IDs. Meta automatic configuration is disabled. Google Consent Mode v2 defaults precede config/events. `ad_user_data` remains denied because no enhanced conversions are used. Preview hosts never load these SDKs. Unknown query parameters, fragments and email-like campaign values are removed before tag initialization.

The original app `/privacy/` URL and policy are preserved. The new bilingual `/website-privacy/` explains this website's collection and withdrawal route. Email signup is available without optional consent.

Hub presence on DIVEROID now follows the same analytics choice, including on support/privacy pages after consent on the homepage. The metric measures visible, participating browsers within the existing 60-second window; users who decline, block scripts, or enable GPC/DNT are excluded. This is not an exact count of every human visitor. WatchDive's existing consent handling is unchanged.

## Notion destination and field definitions

Existing database: `ec0b5179-81ca-8247-8258-018de4f6f76d`; data source `303b5179-81ca-8344-9ffc-077f4ca830cc`. Existing Email, Registered At, Language, Source, Status and Notes are retained. No historical fields are fabricated. Registered At now includes UTC time for new submissions. Default table now also displays campaign source/medium/name, country, device and consent.

- Always: email, form language, server signup time/UUID, notice version and optional-consent snapshot. Legacy clients remain accepted and labeled `legacy`.
- With analytics: device/browser/OS categories, browser language/timezone, viewport band, seconds from page load to submit (capped at one day), counted homepage loads (Visits), coarse Vercel country/region codes. IP and raw UA are never saved.
- With analytics or advertising: first/latest allowed touch, referring **hostname only**, UTM source/medium/campaign/content/term/id. First touch expires 90 days after the first permitted page load. Latest touch represents the latest homepage load, including direct return visits; it is not last-non-direct attribution.
- With advertising: valid `gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid` within the first/latest touch JSON. Device/geography still require analytics consent.
- Attribution Details contains the complete allowlisted first/latest objects. Signup Context contains notice version and consented technical categories. These JSON values are bounded and chunked to Notion rich-text limits.

All browser metadata is self-reported; the API repeats the allowlist and consent checks. Country/region use Vercel-provided headers. Missing information stays blank. Browser timezone is a preference, not proof of location. Optional properties never permit an arbitrary request blob to be stored.

`success:true` is returned only after Notion confirms the write. Its server UUID is used as the browser conversion event ID; repeated calls with that ID in the same page are ignored. There is no server-side CAPI or automatic signup retry in this change, and separate repeated form submissions can still create separate records. Ad blockers and closed tabs can cause platform totals to differ from Notion; Notion is the signup source of truth.

## Verification and operation

- `node --test test/*.test.mjs`: consent defaults/granularity/revocation/expiry, attribution persistence and sanitization, event deduplication, preview isolation, API storage/failure/privacy behavior and live presence lifecycle.
- A real Notion schema round-trip saved campaign/country/device/consent and verified the new fields. The temporary `.invalid` test row was archived immediately.
- Browser review covers Korean/English, 390px mobile and desktop, consent settings, no horizontal overflow and truthful form failures. Consent banner sits above the existing support chat button.
- Production acceptance: wait for both GitHub Pages and Vercel Actions; confirm new JS and privacy page on www; verify no Google/Meta/TikTok request before consent, selected scripts after consent, and a production form record with the new metadata. Account-side report appearance can lag; pixel installation is not proof of an Ads account conversion action.

### Production verification, 2026-11-02

The first deployment exposed a function startup failure after adding a shared ESM import. Declaring `type: module` in the root `package.json` restored GET 405 / OPTIONS 200 / POST 200. Tests now import the actual function entry point instead of rewriting it into a data URL. Deployment CI checks the live endpoint without creating records, with bounded retries for alias propagation.

On the actual www domain: no ad/analytics requests before consent; after Allow all, Google tag and Meta SDK returned 200, GA collection returned 204, Meta PageView returned 200, and the Hub heartbeat returned 204. TikTok made no request because no real pixel exists yet.

A real form submission through the production API stored UTC registration time, campaign source/medium/name, country/region, device/browser, language/timezone, notice version and consent choices in the existing Notion DB. Both custom signup-event calls were observed after the save. The QA harness intercepted those specific conversion calls to avoid reporting a fabricated subscriber to ad platforms; it did not mock the API or Notion. The temporary test record was archived after verification.

References: [Google Consent Mode setup](https://developers.google.com/tag-platform/security/guides/consent), [TikTok pixel creation](https://ads.tiktok.com/resources/help/article/how-to-create-and-access-tiktok-pixel-id?lang=en-GB), [TikTok cookie consent](https://business-api.tiktok.com/portal/docs/pixel-cookie-consent-mode/v1.3).
