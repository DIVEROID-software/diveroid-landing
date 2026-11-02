import { recoverVerifications } from "../lib/reoon-recovery.mjs";

try {
  const summary = await recoverVerifications();
  console.log("subscription_verification_recovery", summary);
  if (summary.failed || summary.blocked) process.exitCode = 1;
} catch (error) {
  // No upstream response bodies, email addresses, or credential-bearing URLs.
  console.error("subscription_verification_recovery_failed", { code: error.code ?? "recovery_error" });
  process.exitCode = 1;
}
