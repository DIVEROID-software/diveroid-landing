/**
 * DIVEROID Landing Page — 이메일 구독 API
 * 최종 업데이트: 2026-04-04
 *
 * Vercel Serverless Function (Edge Runtime X, Node.js)
 * 엔드포인트: POST /api/subscribe
 * 요청: { email: string, lang: "ko" | "en" }
 * 응답: { success: true } | { error: string }
 *
 * Notion DB 저장 구조:
 *   Email        (title)  — 이메일 주소
 *   Registered At (date)  — 구독 날짜
 *   Language     (select) — KO | EN
 *   Source       (select) — Landing Page
 *   Status       (select) — New
 *
 * 필요 환경변수 (Vercel Dashboard → Settings → Environment Variables):
 *   NOTION_API_KEY      — Notion Integration Secret
 *   DATABASE_ID는 코드에 하드코딩: 3371717f-b044-81ac-9159-d9b4afedb80e
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, lang } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const DATABASE_ID = "3371717f-b044-81ac-9159-d9b4afedb80e";

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties: {
          Email: {
            title: [{ text: { content: email } }],
          },
          "Registered At": {
            date: { start: new Date().toISOString().split("T")[0] },
          },
          Language: {
            select: { name: lang === "en" ? "EN" : "KO" },
          },
          Source: {
            select: { name: "Landing Page" },
          },
          Status: {
            select: { name: "New" },
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Notion API error:", err);
      return res.status(500).json({ error: "Failed to save to Notion" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
