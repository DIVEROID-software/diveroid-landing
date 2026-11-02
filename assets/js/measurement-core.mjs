// Shared browser/API allowlist. Never accept an arbitrary context blob or URL.
export const CONSENT_VERSION = "2026-11-02";
export const CONSENT_KEY = "diveroid.measurement-consent.v1";
export const ATTRIBUTION_KEY = "diveroid.attribution.v1";
export const ATTRIBUTION_TTL = 90 * 86400000;
export const CONSENT_TTL = 180 * 86400000;
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"];
export const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid"];

export function cleanText(value, max = 120) {
  if (typeof value !== "string" || /@|%40|[\u0000-\u001f\u007f]/i.test(value)) return "";
  return value.trim().slice(0, max);
}
export function referrerHost(value) {
  try {
    if (typeof value !== "string") return "";
    const url = new URL(/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) ? `https://${value}` : value);
    return ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase().slice(0, 200) : "";
  } catch { return ""; }
}
export function safePage(value) {
  try {
    const url = new URL(value);
    if (!["www.diveroid.com", "diveroid.com"].includes(url.hostname)) return "";
    const path = ["/", "/support/", "/privacy/", "/website-privacy/"].includes(url.pathname) ? url.pathname : "/other";
    return `https://www.diveroid.com${path}`;
  } catch { return ""; }
}
const date = (value, now) => {
  const n = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) && n <= now + 300000 && n >= now - CONSENT_TTL ? new Date(n).toISOString() : "";
};
export function normalizeConsent(value, now = Date.now()) {
  const at = date(value?.at, now);
  const valid = value?.version === CONSENT_VERSION && at;
  return { version: CONSENT_VERSION, at: valid ? at : "", analytics: Boolean(valid && value.analytics === true), ads: Boolean(valid && value.ads === true) };
}
export function normalizeTouch(input, ads = false, now = Date.now()) {
  const out = { page: safePage(input?.page), referrer: referrerHost(input?.referrer), at: date(input?.at, now) };
  for (const key of UTM_KEYS) { const v = cleanText(input?.[key]); if (v) out[key] = v; }
  if (ads) for (const key of CLICK_KEYS) {
    const v = input?.[key];
    if (typeof v === "string" && /^[A-Za-z0-9._~-]{8,240}$/.test(v)) out[key] = v;
  }
  return out;
}
export function captureTouch(href, referrer, now = Date.now()) {
  const url = new URL(href);
  return normalizeTouch({ page: href, referrer, at: new Date(now).toISOString(), ...Object.fromEntries([...UTM_KEYS, ...CLICK_KEYS].map(k => [k, url.searchParams.get(k)])) }, true, now);
}
export function classifyDevice(ua) {
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? "Tablet" : /Mobile|iPhone|iPod/i.test(ua) ? "Mobile" : "Desktop";
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Other";
  const browser = /Edg\//i.test(ua) ? "Edge" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "Other";
  return { device, os, browser };
}
export function normalizeMetadata(input, now = Date.now()) {
  const consent = normalizeConsent(input?.consent, now);
  const out = { consent, signupNoticeVersion: input?.signupNoticeVersion === CONSENT_VERSION ? CONSENT_VERSION : "legacy" };
  if (!consent.analytics && !consent.ads) return out;
  if (consent.analytics) {
    const ctx = input?.context || {};
    const oneOf = (v, options) => options.includes(v) ? v : "Other";
    out.context = {
      device: oneOf(ctx.device, ["Desktop", "Mobile", "Tablet"]),
      os: oneOf(ctx.os, ["iOS", "Android", "Windows", "macOS", "Linux"]),
      browser: oneOf(ctx.browser, ["Chrome", "Safari", "Firefox", "Edge", "Samsung Internet"]),
      language: typeof ctx.language === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(ctx.language) ? ctx.language : "",
      timezone: typeof ctx.timezone === "string" && /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(ctx.timezone) ? ctx.timezone.slice(0, 60) : "",
      viewport: oneOf(ctx.viewport, ["Small", "Medium", "Large"]),
      timeToSignup: typeof ctx.timeToSignup === "number" && Number.isFinite(ctx.timeToSignup) ? Math.max(0, Math.min(86400, Math.round(ctx.timeToSignup))) : 0,
      visits: Number.isInteger(ctx.visits) ? Math.max(1, Math.min(1000, ctx.visits)) : 1,
    };
  }
  out.first = normalizeTouch(input?.first, consent.ads, now);
  out.last = normalizeTouch(input?.last, consent.ads, now);
  return out;
}

export function notionMetadata(input, headers = {}, now = Date.now()) {
  const data = normalizeMetadata(input, now), props = {};
  const text = (key, value) => { if (value) props[key] = { rich_text: [{ text: { content: String(value).slice(0, 1900) } }] }; };
  text("Measurement Consent", JSON.stringify(data.consent));
  text("Signup Context", JSON.stringify({ form: "diveroid_season2", signupNoticeVersion: data.signupNoticeVersion, ...(data.context || {}) }));
  if (data.consent.at) props["Consent At"] = { date: { start: data.consent.at } };
  if (data.context) {
    for (const [key, field] of Object.entries({ Device: "device", Browser: "browser", OS: "os", "Browser Language": "language", Timezone: "timezone" })) text(key, data.context[field]);
    props["Time to Signup"] = { number: data.context.timeToSignup };
    props.Visits = { number: data.context.visits };
    // Vercel supplies coarse IP-derived geography. The IP and full UA are never saved.
    if (/^[A-Z]{2}$/.test(headers["x-vercel-ip-country"] || "")) text("Country", headers["x-vercel-ip-country"]);
    if (/^[A-Za-z0-9-]{1,12}$/.test(headers["x-vercel-ip-country-region"] || "")) text("Region", headers["x-vercel-ip-country-region"]);
  }
  if (data.first) {
    for (const [key, field] of Object.entries({ "First Source": "utm_source", "First Medium": "utm_medium", "First Campaign": "utm_campaign" })) text(key, data.first[field]);
    for (const [key, field] of Object.entries({ "UTM Source": "utm_source", "UTM Medium": "utm_medium", "UTM Campaign": "utm_campaign", "UTM Content": "utm_content", "UTM Term": "utm_term" })) text(key, data.last[field]);
    text("Referrer", data.last.referrer);
    text("Landing Page", data.first.page);
    // Split into bounded rich-text chunks so all allowed click IDs survive.
    const detail = JSON.stringify({ first: data.first, last: data.last });
    props["Attribution Details"] = { rich_text: Array.from({ length: Math.ceil(detail.length / 1900) }, (_, i) => ({ text: { content: detail.slice(i * 1900, (i + 1) * 1900) } })) };
  }
  return props;
}
