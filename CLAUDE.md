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
| `CNAME`, `sitemap.xml`, `robots.txt` | 도메인·SEO 설정                                                                                                                        |

## 수정 → 배포 절차

```bash
# 1. 수정 후 로컬 미리보기 (정적 페이지만: 아무 정적 서버 / API 포함: vercel dev)
python3 -m http.server 8000   # http://localhost:8000

# 2. 커밋·푸시
git add -A && git commit -m "수정 내용" && git push

# 3. 프로덕션 배포
vercel --prod
```

- Vercel CLI 로그인 필요 (`vercel login`). 프로젝트 연결은 `.vercel/`에 이미 설정됨.
- 배포 후 https://www.diveroid.com 에서 실제 반영 확인까지가 작업 완료.

## ⚠️ 가드레일 (건드리지 말 것)

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
