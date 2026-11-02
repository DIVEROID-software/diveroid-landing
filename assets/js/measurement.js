import { CONSENT_VERSION, CONSENT_KEY, ATTRIBUTION_KEY, ATTRIBUTION_TTL, UTM_KEYS, CLICK_KEYS, normalizeConsent, normalizeMetadata, captureTouch, classifyDevice } from "./measurement-core.mjs?v=20261102-2";
import { measurementConfig as config } from "./measurement-config.js?v=20261102-2";

const started = Date.now();
const protectedChoice = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const write = (key, value) => { try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch {} };
let consent = normalizeConsent(read(CONSENT_KEY));
let attribution, counted = false;
const loaded = { google: false, meta: false, tiktok: false };
const sent = new Set();
// Capture only allowlisted campaign values in memory; persist only after choice.
const touch = captureTouch(location.href, document.referrer);
// Prevent accidental emails/tokens in a shared link from reaching auto page context.
const cleanURL = new URL(location.href);
for (const key of [...cleanURL.searchParams.keys()]) {
  if (key === "lang" && ["ko", "en"].includes(cleanURL.searchParams.get(key))) continue;
  if (![...UTM_KEYS, ...CLICK_KEYS].includes(key) || !touch[key]) cleanURL.searchParams.delete(key);
}
if (!["", "#main", "#watchdive", "#season2", "#support"].includes(cleanURL.hash)) cleanURL.hash = "";
if (cleanURL.href !== location.href) history.replaceState(history.state, "", cleanURL);

function choice() {
  return protectedChoice() ? { ...consent, analytics: false, ads: false } : consent;
}
function rememberAttribution() {
  const c = choice();
  if (!c.analytics && !c.ads) { attribution = null; write(ATTRIBUTION_KEY, null); return; }
  const previous = attribution || read(ATTRIBUTION_KEY);
  const valid = previous?.expiresAt > Date.now() && previous.expiresAt <= Date.now() + ATTRIBUTION_TTL;
  const raw = { consent: c, first: valid ? previous.first : touch, last: touch };
  const safe = normalizeMetadata(raw);
  attribution = { first: safe.first, last: safe.last, visits: Math.min(1000, (valid && Number.isInteger(previous.visits) ? previous.visits : 0) + (counted ? 0 : 1)), expiresAt: valid ? previous.expiresAt : Date.now() + ATTRIBUTION_TTL };
  counted = true;
  write(ATTRIBUTION_KEY, attribution);
}
function addScript(id, src) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id; script.async = true; script.src = src;
  script.referrerPolicy = "strict-origin-when-cross-origin";
  document.head.appendChild(script);
}
function bootTags() {
  // No external measurement requests on previews or before explicit consent.
  if (!["diveroid.com", "www.diveroid.com"].includes(location.hostname)) return;
  const c = choice();
  // An analytics-only choice must not forward advertising click identifiers.
  const reportingURL = new URL(location.href);
  for (const key of CLICK_KEYS) {
    if (c.ads && touch[key]) reportingURL.searchParams.set(key, touch[key]);
    else reportingURL.searchParams.delete(key);
  }
  if (reportingURL.href !== location.href) history.replaceState(history.state, "", reportingURL);
  if (c.analytics && !loaded.google && /^G-[A-Z0-9]+$/.test(config.google)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: c.ads ? "granted" : "denied", ad_user_data: "denied", ad_personalization: c.ads ? "granted" : "denied" });
    window.gtag("set", "ads_data_redaction", true);
    window.gtag("js", new Date());
    window.gtag("config", config.google, { send_page_view: false, allow_google_signals: c.ads, allow_ad_personalization_signals: c.ads, page_location: location.href, page_referrer: touch.referrer ? `https://${touch.referrer}/` : "" });
    window.gtag("event", "page_view", { site_name: "diveroid", page_location: location.href, page_referrer: touch.referrer ? `https://${touch.referrer}/` : "" });
    addScript("diveroid-google-tag", `https://www.googletagmanager.com/gtag/js?id=${config.google}`);
    loaded.google = true;
  }
  if (c.ads && !loaded.meta && /^\d{10,20}$/.test(config.meta)) {
    const fbq = function (...args) { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args); };
    Object.assign(fbq, { queue: [], loaded: true, version: "2.0", push: fbq });
    window.fbq = fbq; window._fbq = fbq;
    fbq("consent", "grant");
    fbq("set", "autoConfig", false, config.meta);
    fbq("init", config.meta);
    fbq("track", "PageView", { site_name: "diveroid", content_name: "diveroid_home" });
    addScript("diveroid-meta-pixel", "https://connect.facebook.net/en_US/fbevents.js");
    loaded.meta = true;
  }
  if (c.ads && !loaded.tiktok && /^[A-Z0-9]{20}$/.test(config.tiktok)) {
    window.TiktokAnalyticsObject = "ttq";
    const ttq = window.ttq = [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = (target, name) => { target[name] = (...args) => target.push([name, ...args]); };
    for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
    ttq._i = {}; ttq._t = {}; ttq._o = {};
    ttq.instance = id => { const instance = ttq._i[id] || []; for (const method of ttq.methods) ttq.setAndDefer(instance, method); return instance; };
    ttq._i[config.tiktok] = []; ttq._i[config.tiktok]._u = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._t[config.tiktok] = Date.now(); ttq._o[config.tiktok] = {};
    ttq.grantConsent(); ttq.page();
    addScript("diveroid-tiktok-pixel", `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${config.tiktok}&lib=ttq`);
    loaded.tiktok = true;
  }
}
function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (!/^(_ga(?:_|$)|_gid$|_gat|_gcl_|_fbp$|_fbc$|_ttp$|ttcsid)/.test(name)) continue;
    for (const domain of ["", location.hostname, ".diveroid.com"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/;${domain ? ` Domain=${domain};` : ""} SameSite=Lax`;
    }
  }
}
function setChoice(analytics, ads) {
  const old = choice();
  consent = { version: CONSENT_VERSION, at: new Date().toISOString(), analytics: analytics === true && !protectedChoice(), ads: ads === true && !protectedChoice() };
  write(CONSENT_KEY, consent);
  document.getElementById("measurement-dialog")?.close();
  document.getElementById("measurement-banner").hidden = true;
  window.dispatchEvent(new Event("diveroid:measurement-consent-changed"));
  // A reload removes all SDK listeners, including provider-managed automatic events.
  // It also handles analytics-only <-> ads choices without stale provider state.
  if (Object.values(loaded).some(Boolean) && (old.analytics !== consent.analytics || old.ads !== consent.ads)) {
    if (window.gtag) { window[`ga-disable-${config.google}`] = true; window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }); }
    window.fbq?.("consent", "revoke"); window.ttq?.revokeConsent?.();
    clearCookies(); write(ATTRIBUTION_KEY, null);
    location.reload(); return;
  }
  rememberAttribution(); bootTags();
}
function metadata() {
  const c = choice();
  return normalizeMetadata({ consent: c, signupNoticeVersion: CONSENT_VERSION, first: attribution?.first, last: attribution?.last, context: c.analytics ? {
    ...classifyDevice(navigator.userAgent), language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: innerWidth < 768 ? "Small" : innerWidth < 1200 ? "Medium" : "Large",
    timeToSignup: (Date.now() - started) / 1000, visits: attribution?.visits || 1,
  } : undefined });
}
function signupSaved(eventId) {
  if (!/^[0-9a-f-]{36}$/.test(eventId || "") || sent.has(eventId)) return;
  sent.add(eventId);
  const c = choice(), params = { site_name: "diveroid", content_name: "diveroid_season2_signup" };
  if (c.analytics && loaded.google) window.gtag("event", "diveroid_season2_signup", { ...params, event_id: eventId });
  // Custom event keeps Season 2 out of WatchDive's standard Lead optimization.
  if (c.ads && loaded.meta) window.fbq("trackCustom", "DiveroidSeason2Signup", params, { eventID: eventId });
  if (c.ads && loaded.tiktok) window.ttq.track("SubmitForm", params, { event_id: eventId });
}
window.DIVEROID_MEASUREMENT = { metadata, signupSaved, consent: choice };
for (const [id, destination] of [["watchdive-link", "watchdive"], ["press-link", "press_kit"], ["creator-link", "creator_partnerships"]]) {
  document.getElementById(id)?.addEventListener("click", () => {
    if (choice().analytics && loaded.google) window.gtag("event", "diveroid_outbound_click", { site_name: "diveroid", destination });
  });
}
const openSettings = () => {
  const c = choice();
  for (const key of ["analytics", "ads"]) {
    const input = document.getElementById(`consent-${key}`);
    input.checked = c[key]; input.disabled = protectedChoice();
  }
  document.getElementById("consent-browser-choice").hidden = !protectedChoice();
  document.getElementById("measurement-dialog").showModal();
};
document.querySelectorAll("[data-consent-settings]").forEach(el => el.addEventListener("click", openSettings));
document.getElementById("consent-allow").addEventListener("click", () => setChoice(true, true));
document.getElementById("consent-decline").addEventListener("click", () => setChoice(false, false));
document.getElementById("consent-save").addEventListener("click", () => setChoice(document.getElementById("consent-analytics").checked, document.getElementById("consent-ads").checked));
document.getElementById("consent-close").addEventListener("click", () => document.getElementById("measurement-dialog").close());
document.getElementById("measurement-banner").hidden = Boolean(consent.at) || protectedChoice();
window.addEventListener("storage", event => { if (event.key === CONSENT_KEY || event.key === null) location.reload(); });
rememberAttribution(); bootTags();
