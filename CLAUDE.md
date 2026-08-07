# DIVEROID 공식 랜딩페이지 (www.diveroid.com)

> 이 저장소는 **www.diveroid.com 라이브 사이트**의 소스입니다. 2026-08부터 담당: **Jay (jay@diveroid.com)**.
> AI 어시스턴트는 이 문서를 기준으로 작업하세요. 사람용 상세 인수인계는 `HANDOFF_JAY.md` 참고.

## 한눈에 보기

- **스택**: 순수 정적 HTML/CSS/JS — 빌드 없음, 프레임워크 없음, npm 없음
- **호스팅**: Vercel (프로젝트 `diveroid-landing`) + 커스텀 도메인 `www.diveroid.com`
- **GitHub**: `DIVEROID-software/diveroid-landing` (Public)
- **도메인**: Hostinger에서 등록 (jay@diveroid.com 계정, 만료 2027-02-11)

## 파일 지도

| 경로                                 | 역할                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                         | 메인 랜딩 (858줄, 단일 파일 — HTML+CSS+JS 인라인). 수중 배경 슬라이드쇼 4장, "바다를 이해하는 AI" 헤드라인, 이메일 구독 폼, KO/EN 토글 |
| `support/index.html`                 | 고객지원 페이지                                                                                                                        |
| `app/index.html`                     | 제품 박스 QR코드 → 앱스토어 스마트 리다이렉트                                                                                          |
| `privacy/index.html`                 | 앱 개인정보처리방침 (KO/EN) — 앱 심사에 연결된 페이지, URL 변경 금지                                                                   |
| `api/subscribe.js`                   | Vercel 서버리스 함수 — 이메일 구독 → Notion DB 저장                                                                                    |
| `assets/images/`                     | 배경 4장(bg-1~4.jpg) + OG 공유카드(og-image.jpg)                                                                                       |
| `assets/i18n/landing.js`             | KO/EN 문구 사전 — **카피 수정은 대부분 여기**                                                                                          |
| `hiring/`                            | 채용 페이지 — **빌드 산출물. 직접 수정 금지** (아래 "채용 페이지" 참고)                                                                |
| `CNAME`, `sitemap.xml`, `robots.txt` | 도메인·SEO 설정                                                                                                                        |

## 수정 → 배포 절차

```bash
# 1. 수정 후 로컬 미리보기 (정적 페이지만: 아무 정적 서버 / API 포함: vercel dev)
python3 -m http.server 8000   # http://localhost:8000

# 2. 커밋·푸시 — main에 push하면 GitHub Actions가 자동으로 프로덕션 배포
git add -A && git commit -m "수정 내용" && git push
```

- 자동배포: `.github/workflows/deploy.yml` (push → Vercel `--prod`). 진행 상황은 GitHub → Actions 탭.
- 백업 수단: Vercel CLI 권한이 있으면 `vercel --prod` 수동 배포도 가능.
- 배포 후 https://www.diveroid.com 에서 실제 반영 확인까지가 작업 완료 (반영까지 1~2분).

## 채용 페이지 (`/hiring`) — 이 repo에 소스가 없음

`hiring/`은 **Vite+React 프로젝트의 빌드 산출물**입니다. 미니파이된 번들을 직접 고치지 말고 반드시 소스에서 다시 빌드하세요.

- **소스 위치**: `~/Documents/팀 비서 만들기/careers-site` — ⚠️ **git 저장소가 아니며 이 맥북에만 존재합니다** (원격·CI 없음)
- **지원폼 백엔드**: 같은 소스의 `api/applications.ts` + `server/notionApplications.ts` → **별도 Vercel 프로젝트 `diveroid-careers`** (팀 `jays-projects-c61403c8`). 폼은 `https://diveroid-careers.vercel.app/api/applications`로 POST하며, 이 repo의 Actions 자동배포가 **커버하지 않습니다**
- **필수/검증 로직은 프론트·서버 양쪽에 있습니다.** 한쪽만 고치면 폼이 조용히 깨지므로 항상 **백엔드 먼저** 배포하세요

```bash
cd ~/Documents/팀\ 비서\ 만들기/careers-site

# 1) 백엔드 먼저 (서버 검증 완화가 프론트보다 앞서야 폼이 안 깨짐)
vercel deploy --prod --yes

# 2) 프론트: base=/hiring/ 필수 — 빼면 에셋 경로가 /assets/…로 나와 페이지가 깨집니다
VITE_APPLICATIONS_API_URL="https://diveroid-careers.vercel.app/api/applications" \
  npx vite build --base=/hiring/ --outDir /tmp/build-hiring --emptyOutDir

# 3) 이 repo로 동기화 (해시 파일명이 바뀌므로 옛 번들 삭제) → push하면 자동배포
```



1. **`CNAME` 파일 삭제·수정 금지** — www.diveroid.com 연결이 끊어짐
2. **`api/subscribe.js`의 비밀키는 코드에 없음** — `NOTION_API_KEY`는 Vercel Dashboard → Settings → Environment Variables에 있음. 코드에 키를 하드코딩하지 말 것 (Public repo!)
3. **`/privacy` URL 변경 금지** — App Store/Play Store 심사 자료에 등록된 주소
4. **`/app` 리다이렉트 변경 주의** — 실물 제품 박스에 인쇄된 QR코드가 이 주소를 가리킴
5. **대용량 이미지 커밋 주의** — 배경 이미지는 1~2MB 수준으로 압축해서 (과거 24MB→1.6MB 최적화 이력)
6. **이 사이트 ≠ Shopify** — 쇼핑몰(diveroid-4.myshopify.com, Mazz 테마)은 완전히 별개 시스템. 이 repo에서 관리하지 않음

## 브랜드 기준

- 컬러: Primary `#50A9FC` · 시안 `#72D2F0` · 로열블루 `#3A60D8`
- 법인 표기: **Oceanwick Inc.** (Co.,Ltd 아님)
- CS 공개 연락처: 010-6517-6232 / help@diveroid.com (개인 번호 노출 금지)
