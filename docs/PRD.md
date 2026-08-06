# DIVEROID 임시 홈페이지 (Landing Page) — PRD v1.1

**작성일:** 2026-04-04  
**최종 업데이트:** 2026-04-04  
**작성자:** OceanWick (정은이 AI)  
**버전:** 1.1 (현재 라이브 상태 기준)

---

## 개요 (Overview)

DIVEROID Season 2 런칭 전까지 운영되는 임시 홈페이지입니다.  
Shopify 기반 실제 사이트 완성 전까지 브랜드 신뢰 확보 + 얼리 액세스 이메일 수집 + CS 채널 연결 역할을 담당합니다.

**라이브 URL:** https://www.diveroid.com  
**Vercel URL:** https://diveroid-landing.vercel.app  
**GitHub:** diveroid-software/diveroid-landing  
**배포 플랫폼:** Vercel (자동 HTTPS, 글로벌 CDN)

---

## 목표 (Goals)

1. 홈페이지 부재로 인한 브랜드 신뢰도 문제 해소
2. Season 2 출시 예정 알림 + 얼리 액세스 이메일 수집
3. 기존 고객 CS 채널 (Railway AI 채팅 위젯) 연결
4. 한국어/영어 이중 언어 지원 (해외 고객 대응)

---

## 현재 상태 (라이브 기준, 2026-04-04)

### 화면 구성

단일 페이지 (index.html) — 풀스크린 수중 배경 슬라이드쇼 위에 오버레이:

| 구역      | 내용                                                             |
| --------- | ---------------------------------------------------------------- |
| 헤더      | DIVEROID 로고 (텍스트) + KO/EN 언어 토글                         |
| 배지      | "DIVEROID SEASON 2 — Coming Soon" 애니메이션 배지                |
| 헤드라인  | "바다를 이해하는 AI" (KO) / "AI Understands the Ocean" (EN)      |
| 서브      | "DIVEROID의 새로운 진화가 곧 시작됩니다."                        |
| 이메일 폼 | 이메일 입력 + "가장 먼저 출시 소식 받기" 버튼 → `/api/subscribe` |
| CS 섹션   | "언제든 연락 주세요" + 채팅 버튼 안내                            |
| 마무리    | "곧 만나요! 🤙" + "다이브로이드 팀 🤿"                           |
| CS 위젯   | 우하단 Railway AI 채팅 버튼 (실시간 운영 중)                     |

### 기능

- **배경 슬라이드쇼**: 수중 실사 사진 4장 자동 전환 (5.5초 간격, 2.2초 fade)
- **KO/EN 전환**: 버튼 클릭 시 즉시 전체 텍스트 교체 + sessionStorage 저장
- **이메일 수집**: 폼 제출 → `POST /api/subscribe` → Notion DB 저장 (Vercel API Route)
- **CS 위젯**: Railway AI 시스템 채팅 위젯 (24시간 운영 중)

---

## 파일 구조

```
diveroid-landing/
├── index.html                    ← 메인 랜딩페이지 (단일 파일)
├── PLAN.md                       ← 개발 계획서
├── docs/
│   └── PRD.md                    ← 이 문서
├── design/                       ← 디자인 스펙 (현재 비어있음)
├── dev/                          ← 추가 스크립트 (현재 비어있음)
├── api/
│   └── subscribe.js              ← Vercel Serverless — 이메일 수집 → Notion 저장
└── assets/
    ├── images/                   ← 배경 사진 (bg-1~4.jpg, 수중 실사)
    ├── icons/                    ← 아이콘 (현재 비어있음)
    └── i18n/
        └── landing.js            ← KO/EN 콘텐츠 객체 (LANDING_CONTENT)
```

---

## 기술 스택

| 구분        | 내용                                                              |
| ----------- | ----------------------------------------------------------------- |
| Frontend    | HTML/CSS/Vanilla JS (단일 파일)                                   |
| i18n        | `assets/i18n/landing.js` — `window.LANDING_CONTENT` 객체          |
| 이메일 수집 | Vercel Serverless (`api/subscribe.js`) → Notion API               |
| CS 위젯     | Railway AI 위젯 (`web-production-2bc5f.up.railway.app/widget.js`) |
| 폰트        | Pretendard (CDN) + Inter (Google Fonts)                           |
| 배포        | Vercel (GitHub 자동 배포, push → 즉시 반영)                       |
| 도메인      | www.diveroid.com (DNS Vercel 연결)                                |

---

## i18n 구조

콘텐츠는 `assets/i18n/landing.js` 한 파일에서 관리합니다.

```js
window.LANDING_CONTENT = {
  ko: {
    badge: "...",
    letter: {
      headline: "바다를 이해하는 AI",
      sub: "...",
      emailPlaceholder: "...",
      emailBtn: "...",
      csTitle: "...",
      csBody: "...",
      csItems: [{ icon, text, email }],
      closing: "...",
      sign: "...",
    },
  },
  en: {
    /* 동일 구조 */
  },
};
```

**텍스트 수정 방법:** `assets/i18n/landing.js` 파일만 수정 → push → 자동 배포

---

## 이메일 수집 API

**파일:** `api/subscribe.js` (Vercel Serverless Function)  
**엔드포인트:** `POST /api/subscribe`  
**요청 바디:** `{ email: string, lang: "ko" | "en" }`  
**저장 위치:** Notion DB (환경변수로 연결)

**Vercel 환경변수 (Settings → Environment Variables):**

| 변수명               | 설명                     |
| -------------------- | ------------------------ |
| `NOTION_TOKEN`       | Notion Integration 토큰  |
| `NOTION_DATABASE_ID` | 이메일 수집 Notion DB ID |

---

## 배포 방법

### 코드 수정 후 즉시 배포

```bash
cd ~/Desktop/Projects/diveroid-landing
git add -A
git commit -m "Update landing content"
git push
# → GitHub push → Vercel 자동 빌드 → www.diveroid.com 즉시 반영
```

### 수동 배포 (긴급 시)

```bash
vercel --prod
```

---

## 남은 작업 (Pending)

| 항목                                | 우선순위 | 담당           |
| ----------------------------------- | -------- | -------------- |
| Universal Pro 실제 제품 이미지 교체 | 높음     | 루피 제공 필요 |
| DIVEROID 로고 파일 (SVG/PNG) 교체   | 중간     | 루피 제공 필요 |
| 이메일 수집 목록 확인 (Notion)      | 중간     | 루피           |
| Shopify 완성 시 리디렉션 처리       | 낮음     | Dev            |
| 풀 랜딩페이지 전환 (10섹션 v2.0)    | 낮음     | 루피 승인 후   |

---

## 풀 랜딩페이지 전환 계획 (Phase 1-B, 미착수)

현재 페이지는 Coming Soon 형태. 제품 출시 시 아래 10섹션 풀 랜딩페이지로 전환 예정:

| #   | 섹션         | 행동경제학 전략                             |
| --- | ------------ | ------------------------------------------- |
| 1   | Hero         | 강력한 헤드라인 + CTA                       |
| 2   | Trust Bridge | 2013→2026 타임라인 (신뢰 회복)              |
| 3   | Problem      | 다이버 페인포인트 4개 (손실 회피)           |
| 4   | Solution     | 제품 이미지 + 가치명제 3개 (앵커링)         |
| 5   | Features     | 4개 기능 카드                               |
| 6   | Stats        | 40m / 13년 / 500K+ / 6개 언어 (사회적 증명) |
| 7   | Credibility  | Forbes / 국무총리상 / 글로벌팀 (권위)       |
| 8   | How It Works | 3단계 설명 (단순성)                         |
| 9   | FAQ          | 6개 아코디언 (불안 해소)                    |
| 10  | CTA          | 얼리 액세스 이메일 폼 (희소성 + FOMO)       |

---

## CS 위젯

Railway AI 시스템과 연동된 채팅 위젯이 우하단에 항상 표시됩니다.  
**24시간 운영 중** — 자동 응답 + 에스컬레이션 구조.

```html
<script src="https://web-production-2bc5f.up.railway.app/widget.js?v=20260403"></script>
```

위젯이 로드 실패하더라도 `openChat()` 함수가 `mailto:help@diveroid.com` 으로 폴백합니다.

---

## 주의사항

- `overflow: hidden` — 전체 페이지 스크롤 없음 (풀스크린 단일 화면)
- 배경 이미지는 `assets/images/bg-1~4.jpg` — 파일 교체 시 즉시 반영
- `v=20260403` 쿼리스트링은 위젯 캐시 버스팅용 — 위젯 업데이트 시 날짜 변경
