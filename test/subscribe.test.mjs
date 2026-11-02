import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../api/subscribe.js";
const handler = createHandler({ schedule() {}, verify: async () => {} });

function mockStorage(onSave) {
  return async (url, options) => {
    if (String(url).endsWith('/query')) return { ok: true, json: async () => ({ results: [], has_more: false }) };
    const body = JSON.parse(options.body);
    onSave?.(url, options, body);
    return { ok: true, json: async () => ({ id: 'new-page', properties: body.properties }) };
  };
}

function response() {
  return {
    headers: {}, statusCode: 200,
    setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

test("subscription storage contract", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NOTION_API_KEY;
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  process.env.NOTION_API_KEY = "test-token";
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalKey === undefined) delete process.env.NOTION_API_KEY;
    else process.env.NOTION_API_KEY = originalKey;
  });

  await t.test("stores the form fields in the requested database", async () => {
    let saved;
    globalThis.fetch = mockStorage((url, options) => {
      assert.equal(url, "https://api.notion.com/v1/pages");
      assert.equal(options.headers.Authorization, "Bearer test-token");
      saved = JSON.parse(options.body);
    });
    const res = response();
    await handler({ method: "POST", body: { email: " subscriber@example.com ", lang: "en" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.eventId, /^[0-9a-f-]{36}$/);
    assert.equal(saved.properties["Signup ID"].rich_text[0].text.content, res.body.eventId);
    assert.equal(saved.parent.database_id, "ec0b5179-81ca-8247-8258-018de4f6f76d");
    assert.equal(saved.properties.Email.title[0].text.content, "subscriber@example.com");
    assert.equal(saved.properties.Language.select.name, "EN");
    assert.equal(saved.properties.Source.select.name, "Landing Page");
    assert.equal(saved.properties.Status.select.name, "New");
    assert.equal(saved.properties["Reoon Status"].select.name, "pending");
  });

  await t.test("only consented, allowlisted metadata reaches Notion", async () => {
    let saved;
    globalThis.fetch = mockStorage((_, options) => { saved = JSON.parse(options.body); });
    const metadata = { consent: { version: "2026-11-02", at: new Date().toISOString(), analytics: true, ads: false },
      signupNoticeVersion: "2026-11-02", first: { page: "https://www.diveroid.com/?email=private@example.com", referrer: "https://search.example/path?email=private@example.com", utm_source: "newsletter", fbclid: "secretClick123" },
      last: { utm_campaign: "season2", email: "private@example.com" }, context: { device: "Mobile", browser: "Safari", os: "iOS", language: "ko-KR", timezone: "Asia/Seoul", visits: 2, timeToSignup: 31, fingerprint: "secret-fingerprint" } };
    const res = response();
    await handler({ method: "POST", headers: { "x-vercel-ip-country": "KR", "x-vercel-ip-country-region": "11", "x-forwarded-for": "192.0.2.42" }, body: { email: "subscriber@example.com", metadata } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(saved.properties.Country.rich_text[0].text.content, "KR");
    assert.equal(saved.properties["First Source"].rich_text[0].text.content, "newsletter");
    assert.equal(saved.properties["UTM Campaign"].rich_text[0].text.content, "season2");
    assert.equal(saved.properties.Visits.number, 2);
    assert.doesNotMatch(JSON.stringify(saved), /private@example|secretClick|fingerprint|192\.0\.2/);
    metadata.consent.analytics = false;
    await handler({ method: "POST", headers: { "x-vercel-ip-country": "KR" }, body: { email: "subscriber@example.com", metadata } }, response());
    assert.equal(saved.properties.Country.rich_text[0].text.content, "KR");
    assert.equal(saved.properties["UTM Campaign"], undefined);
    assert.equal(saved.properties.Device, undefined);
  });

  await t.test("country is server-derived even without optional consent; raw IP and client country are ignored", async () => {
    let saved;
    globalThis.fetch = mockStorage((_, __, body) => { saved = body; });
    for (const country of ["KR", undefined, "XX", "ZZ", "KR,US", ["KR"]]) {
      await handler({ method: "POST", headers: { "x-vercel-ip-country": country, "x-forwarded-for": "192.0.2.42" },
        body: { email: "country@example.com", metadata: { country: "US", context: { country: "US" } } } }, response());
      assert.equal(saved.properties.Country?.rich_text[0]?.text.content, country === "KR" ? "KR" : undefined);
      assert.doesNotMatch(JSON.stringify(saved), /192\.0\.2|"US"/);
    }
  });

  await t.test("repeated/case-varied signup keeps the existing unsubscribed record and avoids verification", async () => {
    let calls = 0;
    const custom = createHandler({ verify() { assert.fail("Duplicate was verified again"); } });
    globalThis.fetch = async (url, options) => {
      calls++; assert.match(url, /\/query$/);
      assert.equal(JSON.parse(options.body).filter.title.contains, "existing@example.com");
      return { ok: true, json: async () => ({ results: [{ id: "existing", properties: {
        Email: { title: [{ plain_text: "Existing@Example.com" }] }, Status: { select: { name: "Unsubscribed" } },
        "Signup ID": { rich_text: [{ plain_text: "old-signup" }] },
      } }], has_more: false }) };
    };
    const res = response();
    await custom({ method: "POST", body: { email: " Existing@Example.com " } }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.created, false);
    assert.equal(res.body.eventId, "old-signup"); assert.equal(calls, 1);
  });

  await t.test("simultaneous submissions coalesce and the response does not wait for Reoon", async () => {
    let creates = 0, verifies = 0, finish;
    const work = new Promise(resolve => { finish = resolve; });
    const scheduled = [];
    const custom = createHandler({ schedule: promise => scheduled.push(promise), verify: () => { verifies++; return work; } });
    globalThis.fetch = mockStorage(() => creates++);
    const responses = [response(), response()];
    await Promise.all(responses.map(res => custom({ method: "POST", body: { email: "parallel@example.com" } }, res)));
    assert.equal(creates, 1); assert.equal(verifies, 1); assert.equal(scheduled.length, 1);
    assert.deepEqual(responses.map(r => r.body.created).sort(), [false, true]);
    finish(); await Promise.all(scheduled);
  });

  await t.test("invalid input does not call the storage service", async () => {
    globalThis.fetch = () => assert.fail("Invalid input reached Notion");
    for (const body of [undefined, null, {}, { email: 42 }, { email: "no-address" }, { email: "a@b@c.com" }]) {
      const res = response();
      await handler({ method: "POST", body }, res);
      assert.equal(res.statusCode, 400);
    }
  });

  await t.test("invalid Notion authentication never reports success or logs personal data", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: "unauthorized", message: "subscriber@example.com test-token" }) });
    const res = response();
    await handler({ method: "POST", body: { email: "subscriber@example.com" } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, undefined);
    assert.ok(res.body.requestId);
    assert.equal(logs.at(-1)[1].code, "unauthorized");
    assert.doesNotMatch(JSON.stringify(logs), /subscriber@example.com|test-token/);
  });

  await t.test("network failures and timeouts remain failures", async () => {
    for (const name of ["TypeError", "TimeoutError"]) {
      globalThis.fetch = async () => { throw Object.assign(new Error("private upstream detail"), { name }); };
      const res = response();
      await handler({ method: "POST", body: { email: "subscriber@example.com" } }, res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.success, undefined);
    }
    assert.doesNotMatch(JSON.stringify(logs), /private upstream detail/);
  });

  await t.test("missing configuration fails before contacting Notion", async () => {
    delete process.env.NOTION_API_KEY;
    globalThis.fetch = () => assert.fail("Missing configuration reached Notion");
    const res = response();
    await handler({ method: "POST", body: { email: "subscriber@example.com" } }, res);
    assert.equal(res.statusCode, 503);
  });

  await t.test("browser preflight and unsupported methods do not store data", async () => {
    globalThis.fetch = () => assert.fail("Non-POST request reached Notion");
    const preflight = response(), get = response();
    await handler({ method: "OPTIONS" }, preflight);
    await handler({ method: "GET" }, get);
    assert.equal(preflight.statusCode, 200);
    assert.equal(preflight.headers["Access-Control-Allow-Origin"], "*");
    assert.equal(get.statusCode, 405);
  });
});
