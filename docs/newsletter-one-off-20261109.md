# Owner-authorized exception for existing unsent subscribers

On 2026-11-09 the owner explicitly requested sending the existing unsent Season 2 list once without Reoon validation. This exception includes operational Hold records, but keeps unsubscribes, provider suppressions, internal/test filtering, syntactic validation, duplicate checks and ambiguous-submission holds.

Manual `one-off-preview` is read-only. Manual `one-off-apply` enrolls eligible existing rows created no later than 2026-11-09T06:31:00Z, then runs the existing immediate sender. Enrollment closes after 24 hours. Grants are stored only in each private Notion campaign state and bound to the current normalized email hash. No subscriber exports or allowlists are committed to the public repository.

The grant changes eligibility only: saved Reoon results and subscription Status remain untouched. Every provider claim preserves its grant and existing idempotency key. An accepted or uncertain request cannot be submitted again. Later unsubscribes or provider suppressions still stop a queued recipient.

If provider capacity is insufficient, enrolled recipients remain in the existing daily 10:00 KST queue and may be sent once when capacity returns. Future subscribers have no grant and retain the normal safe-only policy. The provider's account limits and shared transactional headroom remain unchanged. No Reoon calls or credit purchases are made by this operation.
