import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as core from "../assets/js/measurement-core.mjs";

const source = (await readFile(new URL("../assets/js/measurement.js", import.meta.url), "utf8")).replace(/^import .*;\n/gm, "");
const now = Date.now();
const consent = (analytics = true, ads = true) => ({ version: core.CONSENT_VERSION, at: new Date(now).toISOString(), analytics, ads });
function browser({ choice, gpc = false, hostname = "www.diveroid.com", storage = new Map() } = {}) {
  if (choice) storage.set(core.CONSENT_KEY, JSON.stringify(choice));
  const nodes = new Map(), scripts = [], events = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, hidden: true, checked: false, addEventListener: (name, cb) => events.set(`${id}:${name}`, cb), close() {}, showModal() {} });
    return nodes.get(id);
  };
  let reloads = 0;
  const context = { ...core, config: { google: "G-TEST123456", meta: "1234567890123456", tiktok: "ABCDEFGHIJKLMNOPQRST" }, URL, Date, Set, Object, Array, Boolean, String, Math, JSON, Intl,
    Event: class { constructor(type) { this.type = type; } },
    navigator: { globalPrivacyControl: gpc, userAgent: "Mozilla iPhone Mobile Safari", language: "ko-KR" }, innerWidth: 390,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    location: { hostname, href: `https://${hostname}/?lang=ko&utm_source=meta&utm_campaign=season2&fbclid=abcdefgh12345&email=private%40example.com#access_token=secret`, reload: () => { reloads++; } },
    document: { referrer: "https://search.example/private?email=private@example.com", cookie: "", getElementById: id => id.startsWith("diveroid-") ? scripts.find(s => s.id === id) : node(id), querySelectorAll: () => [], createElement: () => ({}), head: { appendChild: script => scripts.push(script) } },
    addEventListener: (name, cb) => events.set(name, cb), dispatchEvent: event => events.get(event.type)?.(event),
  };
  context.history = { state: null, replaceState: (_, __, url) => { context.location.href = String(url); } };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, scripts, storage, events, nodes, node, reloads: () => reloads, click: id => events.get(`${id}:click`)(), metadata: () => JSON.parse(JSON.stringify(context.DIVEROID_MEASUREMENT.metadata())) };
}
test("no choice, decline, GPC, DNT and expired consent never load optional tags", () => {
  for (const options of [{}, { choice: consent(false, false) }, { choice: consent(), gpc: true }, { choice: { ...consent(), at: "2020-01-01T00:00:00Z" } }]) {
    const b = browser(options);
    assert.equal(b.scripts.length, 0);
    assert.equal(b.storage.has(core.ATTRIBUTION_KEY), false);
    assert.equal(b.metadata().context, undefined);
    assert.doesNotMatch(b.context.location.href, /private|email|access_token/);
  }
  const b = browser(); b.context.navigator.doNotTrack = "1"; b.click("consent-allow");
  assert.equal(b.scripts.length, 0);
});
test("allow loads configured tags with defaults before config; signup carries no email and deduplicates event ID", () => {
  const b = browser(); b.click("consent-allow");
  assert.equal(b.scripts.length, 3);
  assert.equal(b.context.dataLayer[0][0], "consent");
  assert.equal(b.context.dataLayer[0][1], "default");
  assert.equal(b.context.dataLayer[0][2].analytics_storage, "denied");
  assert.equal(b.context.fbq.queue.filter(x => x[1] === "PageView").length, 1);
  assert.equal(b.context.fbq.queue.some(x => x[1] === "autoConfig" && x[2] === false), true);
  assert.equal(b.context.ttq.filter(x => x[0] === "page").length, 1);
  assert.equal(b.metadata().first.utm_source, "meta");
  assert.equal(b.metadata().first.referrer, "search.example");
  assert.equal(b.metadata().last.fbclid, "abcdefgh12345");
  const id = "11111111-2222-4333-8444-555555555555";
  b.context.DIVEROID_MEASUREMENT.signupSaved(id); b.context.DIVEROID_MEASUREMENT.signupSaved(id);
  assert.equal(b.context.fbq.queue.filter(x => x[1] === "DiveroidSeason2Signup").length, 1);
  assert.equal(b.context.fbq.queue.some(x => x[1] === "Lead"), false);
  assert.equal(b.context.dataLayer.filter(x => x[1] === "diveroid_season2_signup").length, 1);
  assert.doesNotMatch(JSON.stringify([b.context.dataLayer, b.context.fbq.queue, b.context.ttq, b.metadata()]), /private@example|private%40example|access_token/);
});
test("analytics-only strips ad IDs and leaves advertising SDKs unloaded", () => {
  const b = browser({ choice: consent(true, false) });
  assert.equal(b.scripts.length, 1);
  assert.match(b.scripts[0].src, /googletagmanager/);
  assert.equal(b.metadata().last.fbclid, undefined);
  assert.doesNotMatch(b.context.location.href, /fbclid/);
  assert.equal(b.context.dataLayer[1][2].ad_storage, "denied");
});
test("ads-only does not collect device context or boot GA4; preview never calls vendors", () => {
  const b = browser({ choice: consent(false, true) });
  assert.equal(b.scripts.length, 2); assert.equal(b.metadata().context, undefined);
  assert.equal(browser({ choice: consent(), hostname: "localhost" }).scripts.length, 0);
});
test("withdrawal stops SDKs, clears attribution, reloads and prevents later conversions", () => {
  const b = browser({ choice: consent() }); b.click("consent-decline");
  assert.equal(b.reloads(), 1); assert.equal(b.storage.has(core.ATTRIBUTION_KEY), false);
  assert.equal(b.context.fbq.queue.at(-1)[1], "revoke");
  b.context.DIVEROID_MEASUREMENT.signupSaved("11111111-2222-4333-8444-555555555555");
  assert.equal(b.context.fbq.queue.some(x => x[1] === "DiveroidSeason2Signup"), false);
  assert.equal(browser({ storage: b.storage }).scripts.length, 0);
});
test("first touch persists across visits, malformed and expired attribution is replaced", () => {
  const b = browser({ choice: consent() });
  const old = JSON.parse(b.storage.get(core.ATTRIBUTION_KEY)); old.first.utm_source = "newsletter";
  b.storage.set(core.ATTRIBUTION_KEY, JSON.stringify(old));
  const next = browser({ storage: b.storage });
  assert.equal(next.metadata().first.utm_source, "newsletter");
  assert.equal(next.metadata().last.utm_source, "meta");
  assert.equal(next.metadata().context.visits, 2);
  b.storage.set(core.ATTRIBUTION_KEY, JSON.stringify({ ...old, expiresAt: now - 1 }));
  assert.equal(browser({ storage: b.storage }).metadata().first.utm_source, "meta");
});
test("metadata allowlist rejects PII, arbitrary geography, oversized click IDs and raw URLs", () => {
  const out = core.notionMetadata({ consent: consent(), first: { page: "https://www.diveroid.com/?email=private@example.com", referrer: "https://search.example/path?secret=abc", fbclid: "x".repeat(300), utm_source: "private@example.com" }, last: { utm_campaign: "launch", ttclid: "abcdefgh123456" }, context: { visits: 2000, timeToSignup: Infinity, language: "ko-KR", timezone: "Asia/Seoul", ip: "192.0.2.1", userAgent: "secret" }, country: "US" }, { "x-vercel-ip-country": "KR", "x-forwarded-for": "192.0.2.1" });
  assert.equal(out.Country, undefined); // Stored by the signup server independently of optional measurement.
  assert.equal(out.Visits.number, 1000);
  assert.equal(out["Time to Signup"].number, 0);
  assert.doesNotMatch(JSON.stringify(out), /private@example|192\.0\.2|secret|fbclid/);
  assert.match(JSON.stringify(out), /ttclid/);
});
