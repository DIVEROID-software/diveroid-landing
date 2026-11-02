import test from "node:test";
import assert from "node:assert/strict";
import { verifyStoredSubscriber, resultProperties } from "../lib/reoon.mjs";
import { recoverVerifications } from "../lib/reoon-recovery.mjs";

const ok = data => ({ ok: true, status: 200, json: async () => data });
function subscriber(id, status = "pending") {
  return { id, properties: {
    Email: { title: [{ text: { content: `${id}@example.com` } }] },
    Status: { select: { name: "Unsubscribed" } }, Notes: { rich_text: [{ text: { content: "Keep excluded" } }] },
    Country: { rich_text: [{ text: { content: "KR" } }] },
    "Reoon Status": { select: status ? { name: status } : null }, "Reoon Attempts": { number: 0 },
    "Reoon Task ID": { rich_text: [] }, "Reoon Retry At": { date: null },
  } };
}

function mockServices(pages, provider) {
  const state = new Map(pages.map(page => [page.id, structuredClone(page)]));
  const calls = [], writes = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "emailverifier.reoon.com") { calls.push({ path: url.pathname, method: options.method, url, body: options.body && JSON.parse(options.body) }); return provider(url, options); }
    assert.equal(url.hostname, "api.notion.com");
    if (url.pathname.endsWith("/query")) return ok({ results: structuredClone([...state.values()].filter(p => !p.properties["Reoon Status"].select || ["pending", "error"].includes(p.properties["Reoon Status"].select.name))), has_more: false });
    const id = url.pathname.split("/").at(-1), page = state.get(id);
    assert.ok(page, `Unexpected Notion page ${id}`);
    if (options.method === "PATCH") {
      const properties = JSON.parse(options.body).properties;
      writes.push({ id, properties }); Object.assign(page.properties, properties);
    }
    return ok(structuredClone(page));
  };
  return { state, calls, writes };
}

test("automatic verification and durable recovery", async t => {
  const original = { fetch: globalThis.fetch, notion: process.env.NOTION_API_KEY, reoon: process.env.REOON_API_KEY, error: console.error, log: console.log };
  const logs = [];
  process.env.NOTION_API_KEY = "private-notion-key"; process.env.REOON_API_KEY = "private-reoon-key";
  console.error = (...args) => logs.push(args); console.log = () => {};
  t.after(() => {
    globalThis.fetch = original.fetch; console.error = original.error; console.log = original.log;
    for (const [name, value] of [["NOTION_API_KEY", original.notion], ["REOON_API_KEY", original.reoon]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  await t.test("power result is stored without changing exclusion, notes, or geography", async () => {
    const page = subscriber("lead");
    const s = mockServices([page], url => {
      assert.equal(url.searchParams.get("mode"), "power");
      assert.equal(url.searchParams.get("key"), "private-reoon-key");
      return ok({ email: "lead@example.com", status: "safe", overall_score: "98", is_safe_to_send: true });
    });
    await verifyStoredSubscriber("lead");
    const props = s.state.get("lead").properties;
    assert.equal(props["Reoon Status"].select.name, "safe"); assert.equal(props["Reoon Score"].number, 98);
    assert.ok(props["Reoon Checked At"].date.start); assert.equal(props["Reoon Retry At"].date, null);
    for (const name of ["Status", "Notes", "Country"]) assert.deepEqual(props[name], page.properties[name]);
    assert.ok(s.writes.every(w => Object.keys(w.properties).every(k => k.startsWith("Reoon "))));
    await verifyStoredSubscriber("lead"); assert.equal(s.calls.length, 1);
  });

  await t.test("unknown is a completed inconclusive result, not an automatically billable retry", async () => {
    const s = mockServices([subscriber("unknown")], () => ok({ email: "unknown@example.com", status: "unknown", overall_score: null }));
    await verifyStoredSubscriber("unknown"); await verifyStoredSubscriber("unknown");
    assert.equal(s.calls.length, 1); assert.equal(s.state.get("unknown").properties["Reoon Score"].number, null);
  });

  await t.test("wrong-address response cannot mark a subscriber safe", async () => {
    const s = mockServices([subscriber("wrong")], () => ok({ email: "other@example.com", status: "safe", overall_score: 99 }));
    await verifyStoredSubscriber("wrong");
    assert.equal(s.state.get("wrong").properties["Reoon Status"].select.name, "error");
    assert.equal(s.state.get("wrong").properties["Reoon Error"].rich_text[0].text.content, "invalid_reoon_response");
    assert.ok(s.state.get("wrong").properties["Reoon Retry At"].date.start);
  });

  await t.test("outages stop after three attempts and do not expose keys or emails in logs", async () => {
    const s = mockServices([subscriber("outage")], () => { throw new Error("private-reoon-key outage@example.com"); });
    for (let i = 0; i < 4; i++) await verifyStoredSubscriber("outage");
    assert.equal(s.calls.length, 3);
    assert.equal(s.state.get("outage").properties["Reoon Attempts"].number, 3);
    assert.equal(s.state.get("outage").properties["Reoon Retry At"].date, null);
    assert.doesNotMatch(JSON.stringify(logs), /private-reoon-key|outage@example.com/);
  });

  await t.test("missing key or exhausted credits remain visible errors", async () => {
    const s = mockServices([subscriber("credits")], () => ({ ok: false, status: 400, json: async () => ({ status: "error", reason: "Insufficient credits" }) }));
    await verifyStoredSubscriber("credits");
    assert.equal(s.state.get("credits").properties["Reoon Error"].rich_text[0].text.content, "reoon_credits_exhausted");
    delete process.env.REOON_API_KEY;
    const m = mockServices([subscriber("missing")], () => assert.fail("Missing key reached Reoon"));
    await verifyStoredSubscriber("missing");
    assert.equal(m.state.get("missing").properties["Reoon Status"].select.name, "error");
    process.env.REOON_API_KEY = "private-reoon-key";
  });

  await t.test("scheduled recovery leaves a fresh background task alone", async () => {
    const page = subscriber("fresh"); page.properties["Reoon Retry At"] = { date: { start: new Date(Date.now() + 600000).toISOString() } };
    const s = mockServices([page], () => assert.fail("Active background verification was duplicated"));
    assert.equal((await recoverVerifications()).due, 0); assert.equal(s.calls.length, 0);
  });

  await t.test("large backlog uses one bulk job and resumes without another paid submission", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => subscriber(`batch${i}`, null));
    let complete = false;
    const s = mockServices(pages, (url, options) => {
      if (options.method === "POST") return { ...ok({ status: "success", task_id: 1234, count_processing: 12 }), status: 201 };
      assert.match(url.pathname, /get-result-bulk/);
      return ok(complete ? { status: "completed", results: Object.fromEntries(pages.map(p => [`${p.id}@example.com`, { email: `${p.id}@example.com`, status: "safe", overall_score: 98 }])) } : { status: "running" });
    });
    const first = await recoverVerifications(); assert.equal(first.bulkSubmitted, 12);
    for (const p of s.state.values()) { assert.equal(p.properties["Reoon Task ID"].rich_text[0].text.content, "1234"); p.properties["Reoon Retry At"] = { date: null }; }
    complete = true;
    assert.equal((await recoverVerifications()).resumed, 12);
    assert.equal(s.calls.filter(c => c.method === "POST").length, 1);
    assert.equal(s.calls.filter(c => c.path.endsWith("/verify")).length, 0);
    assert.ok([...s.state.values()].every(p => p.properties.Status.select.name === "Unsubscribed" && p.properties["Reoon Status"].select.name === "safe"));
  });

  await t.test("ambiguous bulk submission is stopped for review instead of charged again", async () => {
    const pages = Array.from({ length: 10 }, (_, i) => subscriber(`uncertain${i}`, null));
    const s = mockServices(pages, () => { throw new Error("Connection lost after POST"); });
    assert.equal((await recoverVerifications()).failed, 1);
    assert.equal((await recoverVerifications()).blocked, 10);
    assert.equal(s.calls.length, 1);
    assert.ok([...s.state.values()].every(p => p.properties["Reoon Error"].rich_text[0].text.content === "bulk_submission_uncertain"));
  });

  await t.test("invalid status and score are rejected", () => {
    assert.throws(() => resultProperties({ email: "x@example.com", status: "valid" }, "x@example.com"));
    assert.throws(() => resultProperties({ email: "x@example.com", status: "safe", overall_score: 1000 }, "x@example.com"));
  });
});
