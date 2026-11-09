# Remaining Season 2 recipients via Gmail

The owner requested sending the existing 202-person remainder without Resend. Resend marketing remains paused with repository NEWSLETTER_ENABLED=false. Authentication mail is independent.

`Prepare encrypted Gmail remainder handoff` takes only existing quota-waiting records created by the original cohort cutoff, honors the previously authorized Reoon bypass grants and opt-outs, and stops if more than 202 are selected. It performs zero Resend/Reoon calls and sends no customer mail. Signed unsubscribe/open URLs and approved KO/EN bodies are rendered using existing GitHub secrets. Each record is moved to manual_review with transport=gmail and a fixed gmailBatchId before the export. Future and already-submitted recipients are excluded.

Only an RSA-OAEP-SHA256/AES-256-GCM encrypted artifact is uploaded. Its private key and decrypted payload stay on the office Mac mini in a mode700 private directory; no keys or subscriber exports belong in this repository. The committed PEM is a public encryption key only. The export is not itself a send or delivery receipt.

The root operator uses the connected Gmail account after an actual From-help QA. Before each individual POST it checks the fresh Notion state, opts out, existing receipts, identity hash and batch, then persists gmail_submitting plus an attempt timestamp. A Gmail response ID is saved to Notion as gmail:<id>, with Gmail transport, submitted time and original grant. An uncertain POST retains its claim and cannot be blindly retried. Known receipts are journaled privately on the server and can be reconciled without sending again.

Gmail provider acceptance/SENT-label readback is distinct from confirmed recipient delivery. Do not populate WatchDive 전달일 from Gmail acceptance. Existing signed opt-out body links remain active. Do not resume Resend for this remainder or enroll the separate historical master. Future scheduling/transport is a separate operational decision.
