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
 *   REOON_API_KEY       — 서버 전용 Reoon 인증키
 *   저장 DB: ec0b5179-81ca-8247-8258-018de4f6f76d
 */
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { notionMetadata } from "../assets/js/measurement-core.mjs";
import { DATABASE_ID, normalizeEmail, notion, plainText, saveOnce, signupCountry } from "../lib/subscriptions.mjs";
import { pendingProperties, verifyStoredSubscriber } from "../lib/reoon.mjs";

export function createHandler({ schedule = waitUntil, verify = verifyStoredSubscriber } = {}) {
  return async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { email: input, lang, metadata } = req.body ?? {};
    const email = normalizeEmail(input);

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const NOTION_API_KEY = process.env.NOTION_API_KEY;
    // User Feedback → Season 2 Early Access — 사전 신청자.
    // The integration must have access to this database; the previous production
    // credential returned 401 on 2026-11-02. See the incident report in docs/.
    const requestId = randomUUID();
    if (!NOTION_API_KEY) {
      console.error("subscription_save_failed", { requestId, code: "missing_configuration" });
      return res.status(503).json({ error: "Subscription temporarily unavailable", requestId });
    }

    try {
      const { page, created } = await saveOnce(email, () => notion("pages", {
        method: "POST", body: {
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
            ...signupCountry(req.headers),
            ...pendingProperties(),
            "Reoon Attempts": { number: 0 },
          },
        },
      }));
      if (!page.id) throw new Error("Invalid storage response");
      if (created) {
        // The durable pending row is also retried by the scheduled recovery worker.
        // A Reoon outage must not turn an already saved signup into a form error.
        const work = verify(page.id).catch(error => console.error("subscription_verification_deferred", {
          requestId, code: error?.code ?? "background_error",
        }));
        try { schedule(work); } catch { console.error("subscription_verification_deferred", { requestId, code: "scheduler_error" }); }
      }
      return res.status(200).json({ success: true, created, eventId: plainText(page.properties?.["Signup ID"]) || page.id });
    } catch (err) {
      console.error("subscription_save_failed", {
        requestId, code: err?.code ?? "storage_error",
      });
      return res.status(503).json({ error: "Subscription temporarily unavailable", requestId });
    }
  };
}

export default createHandler();
