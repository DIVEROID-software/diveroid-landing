import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../api/subscribe.js", import.meta.url), "utf8");
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

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
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.notion.com/v1/pages");
      assert.equal(options.headers.Authorization, "Bearer test-token");
      saved = JSON.parse(options.body);
      return { ok: true };
    };
    const res = response();
    await handler({ method: "POST", body: { email: " subscriber@example.com ", lang: "en" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.equal(saved.parent.database_id, "ec0b5179-81ca-8247-8258-018de4f6f76d");
    assert.equal(saved.properties.Email.title[0].text.content, "subscriber@example.com");
    assert.equal(saved.properties.Language.select.name, "EN");
    assert.equal(saved.properties.Source.select.name, "Landing Page");
    assert.equal(saved.properties.Status.select.name, "New");
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
