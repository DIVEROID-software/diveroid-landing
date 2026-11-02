// Read-only production diagnostic. Never output tokens, emails, or raw logs.
import { spawnSync } from "node:child_process";

const { VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID } = process.env;
if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID) throw new Error("Missing deployment configuration");
const report = {};
async function vercel(path) {
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", VERCEL_ORG_ID);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
  return { status: response.status, data: await response.json() };
}
const project = await vercel(`/v9/projects/${VERCEL_PROJECT_ID}`);
report.project = { status: project.status, name: project.data.name };
const envs = await vercel(`/v9/projects/${VERCEL_PROJECT_ID}/env`);
report.environment = { status: envs.status };
const variable = (envs.data.envs ?? []).find((item) => item.key === "NOTION_API_KEY" && item.target?.includes("production"));
report.environment.notionConfigured = Boolean(variable);
if (variable) {
  const decrypted = await vercel(`/v1/projects/${VERCEL_PROJECT_ID}/env/${variable.id}`);
  const token = decrypted.data.value;
  report.environment.readable = decrypted.status === 200 && typeof token === "string" && decrypted.data.decrypted === true;
  if (report.environment.readable) {
    async function notion(path, body) {
      const response = await fetch(`https://api.notion.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    const identity = await notion("users/me");
    report.notionIdentity = { status: identity.status, code: identity.data.code, workspace: identity.data.bot?.workspace_name };
    report.databases = [];
    for (const [label, id] of [["old", "3371717f-b044-81ac-9159-d9b4afedb80e"], ["requested", "ec0b5179-81ca-8247-8258-018de4f6f76d"]]) {
      const schema = await notion(`databases/${id}`);
      const summary = { label, status: schema.status, code: schema.data.code };
      if (schema.status === 200) {
        let cursor;
        const emails = new Set(), dates = [];
        let count = 0;
        do {
          const page = await notion(`databases/${id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
          if (page.status !== 200) { summary.queryError = { status: page.status, code: page.data.code }; break; }
          for (const row of page.data.results) {
            count++;
            const email = row.properties?.Email?.title?.map((item) => item.plain_text ?? item.text?.content ?? "").join("").trim().toLowerCase();
            if (email) emails.add(email);
            const date = row.properties?.["Registered At"]?.date?.start;
            if (date) dates.push(date);
          }
          cursor = page.data.has_more ? page.data.next_cursor : undefined;
        } while (cursor && count < 10000);
        dates.sort();
        Object.assign(summary, { count, uniqueEmails: emails.size, firstRegistered: dates[0], lastRegistered: dates.at(-1), complete: !cursor && !summary.queryError });
      }
      report.databases.push(summary);
    }
  }
}
const logs = spawnSync("vercel", ["logs", "--project", VERCEL_PROJECT_ID, "--scope", VERCEL_ORG_ID, "--since", "7d", "--limit", "1000", "--json", "--token", VERCEL_TOKEN], { encoding: "utf8", timeout: 90000, maxBuffer: 10 * 1024 * 1024 });
const raw = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
const entries = (logs.stdout ?? "").split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
report.logs = {
  exitStatus: logs.status,
  parsedEntries: entries.length,
  entryKeys: entries[0] ? Object.keys(entries[0]) : [],
  subscriptionMentions: (raw.match(/\/api\/subscribe/g) ?? []).length,
  knownErrors: Object.fromEntries(["unauthorized", "object_not_found", "validation_error", "restricted_resource", "API token is invalid", "Failed to save to Notion"].map((text) => [text, raw.split(text).length - 1])),
  retentionMentioned: /retention|outside.*range|plan.*limit/i.test(raw),
  permissionDenied: /forbidden|not authorized|project not found/i.test(raw),
};
console.log(JSON.stringify(report, null, 2));
