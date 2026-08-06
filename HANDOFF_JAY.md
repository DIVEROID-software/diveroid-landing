# 🤝 www.diveroid.com 인수인계 (→ Jay)

작성: 2026-08-06 정은이 (정상훈 팀장 지시)

## 1. 지금 www.diveroid.com이 뭔가요?

- **"바다를 이해하는 AI" 티저 랜딩페이지**입니다 (이메일 수집 + 지원/개인정보 페이지).
- 이 GitHub 저장소(`DIVEROID-software/diveroid-landing`)가 소스이고, **Vercel**로 배포되어 있습니다.
- ⚠️ **쇼핑몰과 별개입니다**: Shopify 스토어(diveroid-4.myshopify.com, Mazz 제작 테마)는 따로 있고 아직 www에 연결하지 않는 정책입니다(low-profile 유지). Shopify 쪽을 만지실 계획이면 상훈 팀장과 먼저 협의해 주세요.

## 2. 대표님이 받으셔야 할 접근 권한 (상훈 팀장이 부여)

| #   | 항목                                                                                                                                    | 상태                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | GitHub `DIVEROID-software/diveroid-landing` **Write 권한**                                                                              | ✅ 이미 보유 (`Kim-Jay-Jungil` 계정으로 7월 /hiring 페이지 push 이력 확인)   |
| 2   | **Vercel 팀** 멤버 초대 (팀 `ilpatto-9874s-projects` / 프로젝트 `diveroid-landing`) — 배포 로그·환경변수 관리용. 평소엔 push만으로 충분 | ⏳ 필요 시 상훈 팀장에게 요청                                                |
| 3   | 도메인(Hostinger)                                                                                                                       | ✅ 이미 jay@diveroid.com 계정 소유 (만료 2027-02-11, 갱신 관리 부탁드립니다) |

## 3. 작업 시작하기 (Jay의 AI에게 시키면 되는 것)

```bash
git clone https://github.com/DIVEROID-software/diveroid-landing.git
cd diveroid-landing
# 저장소 루트의 CLAUDE.md를 AI가 자동으로 읽습니다 (파일 지도·배포법·가드레일 전부 있음)
```

- 순수 정적 HTML이라 개발 환경 설치가 필요 없습니다. 파일 고치고 → push → `vercel --prod` 끝.
- 카피(문구) 수정: `assets/i18n/landing.js` (한/영 사전) 또는 `index.html`
- 이미지 교체: `assets/images/` (1~2MB 이하 압축 권장)

## 4. 자주 할 일 레시피

| 하고 싶은 것      | 방법                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| 문구 바꾸기       | `assets/i18n/landing.js`에서 KO/EN 동시 수정 → push → `vercel --prod`                     |
| 배경 사진 교체    | `assets/images/bg-N.jpg` 교체(같은 파일명) → push → 배포                                  |
| 새 페이지 추가    | 폴더 만들고 `index.html` (예: `about/index.html` → /about) + `sitemap.xml`에 추가         |
| 구독자 명단 보기  | Notion DB (Season2_CS 워크스페이스, DB ID `3371717f-...`) — 폼 제출이 자동 저장됨         |
| 이메일 폼 고장 시 | Vercel Dashboard → diveroid-landing → Logs / Environment Variables(`NOTION_API_KEY`) 확인 |

## 5. 꼭 지켜주세요

1. `CNAME` 파일 = 도메인 연결 그 자체. 삭제 금지.
2. `/privacy`, `/app` 주소 변경 금지 (앱 심사·제품 박스 QR에 박혀 있음).
3. API 키를 코드에 적지 마세요 — **Public 저장소**입니다. 키는 Vercel 환경변수로만.
4. 배포 후엔 꼭 https://www.diveroid.com 새로고침으로 실제 반영 확인.

## 6. 문의

- 구조·히스토리 질문: 정상훈 팀장 (010-9342-9621) / 정은이(AI)가 전체 이력 보유
- 이 저장소의 과거 작업 기록: `PLAN.md`, `docs/PRD.md` 참고
