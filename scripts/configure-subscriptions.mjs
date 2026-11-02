// Manually dispatched maintenance: never print credentials or response bodies.
const { VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, NOTION_SUBSCRIPTION_REPAIR_TOKEN: token } = process.env;
if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID || !token) throw new Error("Missing configuration");

const notionHeaders = { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" };
for (const path of ["users/me", "databases/ec0b5179-81ca-8247-8258-018de4f6f76d"]) {
  const response = await fetch(`https://api.notion.com/v1/${path}`, { headers: notionHeaders });
  if (!response.ok) throw new Error(`Notion access check failed (${response.status})`);
}
console.log("Notion identity and requested database access verified.");

async function vercel(path, body) {
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", VERCEL_ORG_ID);
  const response = await fetch(url, {
    method: body ? "PATCH" : "GET",
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Vercel configuration request failed (${response.status})`);
  return response.json();
}
const result = await vercel(`/v9/projects/${VERCEL_PROJECT_ID}/env`);
const variable = result.envs?.find(item => item.key === "NOTION_API_KEY" && item.target?.includes("production"));
if (!variable) throw new Error("Production NOTION_API_KEY was not found");
await vercel(`/v9/projects/${VERCEL_PROJECT_ID}/env/${variable.id}`, { value: token });
console.log("Existing production Notion credential updated. Redeployment required.");
