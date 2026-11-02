// Deployment setup: credentials must never be printed or committed.
const { VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, REOON_API_KEY } = process.env;
if (![VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, REOON_API_KEY].every(Boolean)) throw new Error("Missing deployment configuration");
const url = new URL(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`);
url.searchParams.set("teamId", VERCEL_ORG_ID);
url.searchParams.set("upsert", "true");
const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30000),
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ key: "REOON_API_KEY", value: REOON_API_KEY, type: "encrypted", target: ["production"] }),
});
if (!response.ok) throw new Error(`Reoon environment setup failed (${response.status})`);
console.log("Production Reoon credential configured.");
