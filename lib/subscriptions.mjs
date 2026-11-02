export const DATABASE_ID = "ec0b5179-81ca-8247-8258-018de4f6f76d";
export const normalizeEmail = value => typeof value === "string" ? value.trim().toLowerCase() : "";
export const richText = value => ({ rich_text: value ? [{ text: { content: String(value).slice(0, 1900) } }] : [] });
export const plainText = property => (property?.rich_text ?? property?.title ?? []).map(x => x.plain_text ?? x.text?.content ?? "").join("");
export const emailOf = page => normalizeEmail(plainText(page.properties?.Email));
export const statusOf = page => page.properties?.["Reoon Status"]?.select?.name;
export const attemptsOf = page => page.properties?.["Reoon Attempts"]?.number ?? 0;
export const retryAt = page => page.properties?.["Reoon Retry At"]?.date?.start;
export const later = (milliseconds, now = Date.now()) => new Date(now + milliseconds).toISOString();

export function signupCountry(headers = {}) {
  // Supplied by Vercel's edge from the request IP, never from form metadata.
  const country = headers["x-vercel-ip-country"];
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) && !["XX", "ZZ"].includes(country)
    ? { Country: richText(country) } : {};
}

export class ServiceError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

export async function notion(path, { method = "GET", body } = {}) {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new ServiceError("missing_notion_key");
  for (let attempt = 0; ; attempt++) {
  let response;
  try {
    response = await fetch(`https://api.notion.com/v1/${path}`, {
      method, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ServiceError(error?.name === "TimeoutError" ? "timeout" : "network_error");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 429 && attempt < 3) {
    // Notion rate-limits at a small per-integration rate. A definitive 429 did
    // not create a page; unlike a lost POST response, it is safe to retry.
    const seconds = Number(response.headers?.get?.("retry-after")) || 1;
    await new Promise(resolve => setTimeout(resolve, Math.max(1000, Math.min(seconds * 1000, 5000))));
    continue;
  }
  if (!response.ok) {
    const known = new Set(["unauthorized", "restricted_resource", "object_not_found", "validation_error", "rate_limited", "conflict_error", "internal_server_error", "service_unavailable"]);
    throw new ServiceError(known.has(data.code) ? data.code : "notion_error", response.status);
  }
  return data;
  }
}

export const updatePage = (id, properties) => notion(`pages/${id}`, { method: "PATCH", body: { properties } });

export async function queryPages(filter, limit = 1000) {
  const rows = []; let cursor;
  do {
    const result = await notion(`databases/${DATABASE_ID}/query`, {
      method: "POST", body: { page_size: 100, ...(filter ? { filter } : {}),
        sorts: [{ timestamp: "created_time", direction: "ascending" }], ...(cursor ? { start_cursor: cursor } : {}) },
    });
    if (!Array.isArray(result.results)) throw new ServiceError("invalid_notion_response");
    rows.push(...result.results);
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor && rows.length < limit);
  return rows;
}

export async function findSubscriber(email) {
  // Contains also finds legacy entries with surrounding whitespace; compare the
  // complete normalized address so partial matches cannot suppress another lead.
  const matches = (await queryPages({ property: "Email", title: { contains: email } }))
    .filter(page => emailOf(page) === email);
  return matches.find(page => page.properties?.Status?.select?.name === "Unsubscribed") ?? matches[0];
}

// Coalesce simultaneous submissions in a warm function. The persistent lookup
// handles later requests/restarts. Notion has no cross-instance unique constraint.
const pendingSignups = new Map();
export async function saveOnce(email, create) {
  if (pendingSignups.has(email)) {
    const result = await pendingSignups.get(email);
    return { page: result.page, created: false };
  }
  const work = (async () => {
    const existing = await findSubscriber(email);
    return existing ? { page: existing, created: false } : { page: await create(), created: true };
  })();
  pendingSignups.set(email, work);
  try { return await work; } finally { if (pendingSignups.get(email) === work) pendingSignups.delete(email); }
}
