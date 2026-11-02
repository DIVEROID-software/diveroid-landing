import { startSitePresence } from "/assets/js/site-presence-client.js?v=20261102-2";
import { CONSENT_KEY, normalizeConsent } from "/assets/js/measurement-core.mjs?v=20261102-2";
startSitePresence({ site: "diveroid", allowed: () => {
  if (window.DIVEROID_MEASUREMENT) return window.DIVEROID_MEASUREMENT.consent().analytics;
  try { return normalizeConsent(JSON.parse(localStorage.getItem(CONSENT_KEY))).analytics; } catch { return false; }
} });
