import { queryPages, emailOf, statusOf, attemptsOf, retryAt, plainText, updatePage, richText, later, ServiceError } from "./subscriptions.mjs";
import { MAX_ATTEMPTS, reoonRequest, pendingProperties, saveResult, markError, verifyStoredSubscriber } from "./reoon.mjs";

export function isDue(page, now = Date.now()) {
  if (page.archived || page.in_trash) return false;
  if (statusOf(page) === "error" && attemptsOf(page) >= MAX_ATTEMPTS) return false;
  return !retryAt(page) || new Date(retryAt(page)).getTime() <= now;
}

async function resumeBulk(taskId, pages) {
  const result = await reoonRequest("get-result-bulk-verification-task/", { task_id: taskId }, { timeout: 30000 });
  if (["waiting", "running"].includes(result.status)) return 0;
  if (result.status !== "completed" || !result.results) throw new ServiceError("bulk_result_unavailable");
  const entries = Array.isArray(result.results) ? result.results : Object.values(result.results);
  const byEmail = new Map(entries.map(row => [String(row.email ?? "").trim().toLowerCase(), row]));
  let saved = 0;
  for (const page of pages) {
    const email = emailOf(page), row = byEmail.get(email);
    if (!row) { await markError(page.id, attemptsOf(page), new ServiceError("bulk_result_missing"), { retry: false }); continue; }
    if (await saveResult(page.id, email, row, { taskId, mode: "bulk_power" })) saved++;
  }
  return saved;
}

export async function recoverVerifications() {
  if (!process.env.REOON_API_KEY || !process.env.NOTION_API_KEY) throw new ServiceError("missing_configuration");
  const rows = await queryPages({ or: [
    { property: "Reoon Status", select: { is_empty: true } },
    { property: "Reoon Status", select: { equals: "pending" } },
    { property: "Reoon Status", select: { equals: "error" } },
  ] });
  const due = rows.filter(page => isDue(page));
  const jobs = new Map(), fresh = [];
  for (const page of due) {
    const id = plainText(page.properties?.["Reoon Task ID"]);
    if (/^\d+$/.test(id)) { if (!jobs.has(id)) jobs.set(id, []); jobs.get(id).push(page); }
    else if (attemptsOf(page) < MAX_ATTEMPTS) fresh.push(page);
  }
  const summary = { pending: rows.length, due: due.length, resumed: 0, single: 0, bulkSubmitted: 0, failed: 0,
    blocked: rows.filter(page => attemptsOf(page) >= MAX_ATTEMPTS && !/^\d+$/.test(plainText(page.properties?.["Reoon Task ID"]))).length };
  for (const [id, pages] of jobs) {
    try { summary.resumed += await resumeBulk(id, pages); }
    catch (error) { summary.failed++; console.error("reoon_bulk_poll_failed", { taskId: id, code: error.code ?? "poll_error" }); }
  }
  // Bound work per run; the rest stays durably queued in Notion.
  const batch = fresh.slice(0, 100);
  if (batch.length < 10) {
    for (const page of batch) { await verifyStoredSubscriber(page.id); summary.single++; }
    return summary;
  }
  // Ten or more queued addresses use Reoon's bulk endpoint, never a single-API loop.
  // Fail closed around the paid POST: a crash before the returned task ID can be
  // persisted must not cause the next worker to submit and pay for the same job.
  for (const page of batch) await updatePage(page.id, { ...pendingProperties(),
    "Reoon Attempts": { number: MAX_ATTEMPTS }, "Reoon Error": richText("bulk_submission_in_progress") });
  let task;
  try {
    task = await reoonRequest("create-bulk-verification-task/", {
      name: `DIVEROID-${Date.now()}`, emails: [...new Set(batch.map(emailOf))],
    }, { post: true, timeout: 30000 });
    if (task.status !== "success" || !task.task_id) throw new ServiceError("invalid_bulk_response");
  } catch (error) {
    // An ambiguous POST may already have consumed credits. Surface it for review
    // rather than automatically creating the same paid job a second time.
    const uncertain = ["reoon_timeout", "reoon_network_error", "invalid_bulk_response"].includes(error.code);
    for (const page of batch) await markError(page.id, attemptsOf(page) + 1,
      uncertain ? new ServiceError("bulk_submission_uncertain") : error, { retry: !uncertain });
    summary.failed++;
    return summary;
  }
  const taskId = String(task.task_id);
  console.log("reoon_bulk_created", { taskId, count: task.count_processing });
  // Persist the paid task ID before polling, so later runs resume without charging again.
  for (const page of batch) {
    await updatePage(page.id, { "Reoon Task ID": richText(taskId), "Reoon Attempts": { number: attemptsOf(page) + 1 },
      "Reoon Error": richText(""), "Reoon Retry At": { date: { start: later(60000) } } });
  }
  summary.bulkSubmitted = batch.length;
  summary.resumed += await resumeBulk(taskId, batch);
  return summary;
}
