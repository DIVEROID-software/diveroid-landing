/**
 * DIVEROID Landing Page — 이메일 구독 API
 * 최종 업데이트: 2026-11-02
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
 *   저장 DB: ec0b5179-81ca-8247-8258-018de4f6f76d
 */
import { randomUUID } from "node:crypto";
import { notionMetadata } from "../assets/js/measurement-core.mjs";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email: input, lang, metadata } = req.body ?? {};
  const email = typeof input === "string" ? input.trim() : "";

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  // User Feedback → Season 2 Early Access — 사전 신청자.
  // The integration must have access to this database; the previous production
  // credential returned 401 on 2026-11-02. See the incident report in docs/.
  const DATABASE_ID = "ec0b5179-81ca-8247-8258-018de4f6f76d";
  const requestId = randomUUID();
  if (!NOTION_API_KEY) {
    console.error("subscription_save_failed", { requestId, code: "missing_configuration" });
    return res.status(503).json({ error: "Subscription temporarily unavailable", requestId });
  }

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
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
            date: { start: new Date().toISOString() },
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
          "Signup ID": { rich_text: [{ text: { content: requestId } }] },
          ...notionMetadata(metadata, req.headers),
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      // Do not log email addresses, request bodies, tokens, or Notion messages
      // (validation messages can contain submitted data).
      const knownCodes = new Set(["unauthorized", "restricted_resource", "object_not_found", "validation_error", "rate_limited", "conflict_error", "internal_server_error", "service_unavailable"]);
      console.error("subscription_save_failed", {
        requestId, status: response.status,
        code: knownCodes.has(err.code) ? err.code : "upstream_error",
      });
      return res.status(503).json({ error: "Failed to save subscription", requestId });
    }

    return res.status(200).json({ success: true, eventId: requestId });
  } catch (err) {
    console.error("subscription_save_failed", {
      requestId, code: err?.name === "TimeoutError" ? "timeout" : "network_error",
    });
    return res.status(503).json({ error: "Subscription temporarily unavailable", requestId });
  }
}
