import { ServiceError, notion, updatePage, emailOf, statusOf, attemptsOf, richText, later } from "./subscriptions.mjs";

export const FINAL_STATUSES = new Set(["safe", "invalid", "disabled", "disposable", "inbox_full", "catch_all", "role_account", "spamtrap", "unknown"]);
export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 10 * 60 * 1000;

export function pendingProperties() {
  return { "Reoon Status": { select: { name: "pending" } },
    "Reoon Retry At": { date: { start: later(LEASE_MS) } }, "Reoon Error": richText("") };
}

export async function reoonRequest(endpoint, parameters, { post = false, timeout = 120000 } = {}) {
  const key = process.env.REOON_API_KEY;
  if (!key) throw new ServiceError("missing_reoon_key");
  const url = new URL(`https://emailverifier.reoon.com/api/v1/${endpoint}`);
  if (!post) url.search = new URLSearchParams({ ...parameters, key }).toString();
  let response;
  try {
    response = await fetch(url, { method: post ? "POST" : "GET", signal: AbortSignal.timeout(timeout),
      ...(post ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parameters, key }) } : {}) });
  } catch (error) {
    // Never log a fetch exception: its URL can contain the API key and email.
    throw new ServiceError(error?.name === "TimeoutError" ? "reoon_timeout" : "reoon_network_error");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.status === "error") {
    const reason = String(result?.reason ?? "").toLowerCase();
    throw new ServiceError(/credit|balance/.test(reason) ? "reoon_credits_exhausted" : "reoon_api_error", response.status);
  }
  return result;
}

export function resultProperties(result, email, { taskId = "", now = new Date().toISOString(), mode = "power" } = {}) {
  if (!FINAL_STATUSES.has(result?.status) || String(result?.email ?? "").trim().toLowerCase() !== email) {
    throw new ServiceError("invalid_reoon_response");
  }
  const value = result.overall_score;
  const score = value === null || value === undefined || value === "None" ? null : Number(value);
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new ServiceError("invalid_reoon_score");
  const detail = { provider: "Reoon", mode };
  for (const field of ["status", "overall_score", "is_safe_to_send", "is_valid_syntax", "is_disposable", "is_role_account", "can_connect_smtp", "has_inbox_full", "is_catch_all", "is_deliverable", "is_disabled", "is_spamtrap", "is_forwarded", "is_free_email", "mx_accepts_mail", "mx_records"]) {
    if (Object.hasOwn(result, field)) detail[field] = result[field];
  }
  return {
    "Reoon Status": { select: { name: result.status } }, "Reoon Score": { number: score },
    "Reoon Checked At": { date: { start: now } }, "Reoon Details": richText(JSON.stringify(detail)),
    "Reoon Task ID": richText(taskId), "Reoon Error": richText(""), "Reoon Retry At": { date: null },
  };
}

export async function saveResult(pageId, email, result, options) {
  const properties = resultProperties(result, email, options);
  const current = await notion(`pages/${pageId}`);
  if (current.archived || current.in_trash || emailOf(current) !== email) return false;
  // Update only verification fields, never subscription state, consent, or notes.
  for (let attempt = 0; ; attempt++) {
    try { await updatePage(pageId, properties); return true; }
    catch (error) {
      if (attempt >= 2 || !["rate_limited", "timeout", "network_error", "internal_server_error", "service_unavailable"].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
}

export async function markError(pageId, attempt, error, { retry = true } = {}) {
  const code = error instanceof ServiceError ? error.code : "verification_error";
  await updatePage(pageId, {
    "Reoon Status": { select: { name: "error" } }, "Reoon Error": richText(code),
    "Reoon Retry At": { date: retry && attempt < MAX_ATTEMPTS ? { start: later(attempt * 15 * 60 * 1000) } : null },
    "Reoon Attempts": { number: retry ? attempt : MAX_ATTEMPTS },
  });
  console.error("subscription_verification_failed", { pageId, code, attempt });
}

export async function verifyStoredSubscriber(pageId) {
  const page = await notion(`pages/${pageId}`);
  if (page.archived || page.in_trash || FINAL_STATUSES.has(statusOf(page)) || attemptsOf(page) >= MAX_ATTEMPTS) return;
  const email = emailOf(page), attempt = attemptsOf(page) + 1;
  await updatePage(pageId, { ...pendingProperties(), "Reoon Attempts": { number: attempt }, "Reoon Task ID": richText("") });
  try {
    const result = await reoonRequest("verify", { email, mode: "power" });
    await saveResult(pageId, email, result);
  } catch (error) { await markError(pageId, attempt, error); }
}
