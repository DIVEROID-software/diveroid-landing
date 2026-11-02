# Automatic email verification

New Season 2 signups are saved to Notion immediately with `Reoon Status=pending`. Vercel's `waitUntil` runs a Reoon **power** verification after the response and records status, score, checked time and detailed flags. The function has a 180-second ceiling; the provider request has a 120-second timeout.

The subscription `Status`, notes and consent are independent from verification. A `safe` result never re-subscribes an excluded address and is not proof of human signup or address ownership. `unknown` is an inconclusive completed result, not a retryable API error. There is no verification email or marketing send in this change.

`Country` stores the ISO country code supplied by Vercel for the signup request IP, including when optional measurement is declined. It is not accepted from the form body. Raw IP, city and coordinates are not saved. Missing/unknown geography stays blank; existing records are not backfilled with guessed locations. Region and other attribution still require optional consent. KO/EN form and website notices describe Reoon and country processing.

## Repeat signups

Email identity is trimmed and lowercased. Before creating a row, the API looks for the existing normalized address. Repeated submissions reuse its record and do not change subscription state, spend another verification credit or emit another browser signup conversion. Simultaneous requests to the same warm instance are coalesced.

Notion has no atomic unique constraint. Independent cold instances can still race; the persistent lookup prevents the sequential repeat submissions observed in the incident but is not a distributed uniqueness guarantee. A transactional unique-key store is needed for that stronger guarantee.

## Recovery and operation

- `Recover pending Reoon verifications` runs at minute 7, 22, 37 and 52 and can be dispatched manually. GitHub's scheduler can delay runs; this is a recovery path, not the normal signup path.
- New tasks have a ten-minute lease to avoid overlapping with the live function. The worker also catches manually imported rows with no Reoon result.
- Failed provider calls get `error`, a non-sensitive `Reoon Error`, attempt count and retry time. There are at most three automatic attempts. API failures, missing credentials and exhausted credits never become `safe`.
- Backlogs of ten or more use Reoon's bulk API. Task IDs are persisted in Notion and resumed on later runs. A paid submission with an uncertain outcome is stopped for review rather than blindly resubmitted. `bulk_submission_in_progress` at the attempt limit means the worker stopped between claiming a batch and persisting its task ID: inspect the workflow's `reoon_bulk_created` task ID and Reoon Tasks & Results before resetting attempts.
- To retry a resolved operational failure, clear `Reoon Retry At`, set `Reoon Attempts` to 0, leave `Reoon Status=error`, and dispatch recovery. Keep a valid bulk task ID to resume that task without another paid submission. Do not reset an uncertain bulk submission before checking whether Reoon already created it.
- The worker prints counts, page/task IDs and bounded error codes only. No emails, raw IPs, keys or credential-bearing URLs enter logs. Public source and artifacts must never contain subscriber exports.

Production uses Vercel `NOTION_API_KEY` and `REOON_API_KEY`. Recovery uses the same names as GitHub Actions secrets. Deployment upserts the Reoon key as an encrypted production environment variable. No automatic credit purchases are configured.

## Checks

`npm test` covers saving before verification finishes, duplicate/excluded records, concurrent submissions, server-derived country without optional consent, unknown results, provider errors, bounded retries, result/address mismatches, bulk resume, ambiguous submissions, and preservation of unrelated properties. Production validation must confirm a saved signup, automatic result, country, duplicate response and scheduled recovery.

Provider references: [Reoon API](https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/), [Vercel waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil), [Vercel country header](https://vercel.com/docs/headers/request-headers#x-vercel-ip-country), [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
