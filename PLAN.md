# DIVEROID Landing Page (임시 홈페이지)

## 프로젝트 개요

www.diveroid.com 에 연결할 임시 홈페이지.
현재 홈페이지 부재로 인한 신뢰도 문제 해소 목적.
Shopify 기반 실제 사이트 완성 전까지 브랜드 신뢰 + CS 연결 역할.

**폴더**: `~/Desktop/Projects/diveroid-landing/`
**배포 URL**: https://diveroid-landing.vercel.app ← 대표 공유용 링크
**도메인**: www.diveroid.com (DNS 연결 예정)
**플랫폼**: Vercel (프로젝트명: diveroid-landing)

---

## 폴더 구조

```
diveroid-landing/
├── index.html              ← 메인 랜딩페이지 (v2.0 완성)
├── PLAN.md
├── .vercel/                ← Vercel 배포 설정 (자동 생성)
├── docs/                   ← 기획 문서, 카피라이팅
├── design/                 ← 디자인 스펙, 에셋
├── dev/                    ← 추가 스크립트
└── assets/
    ├── images/             ← 배경 사진 (bg-1~4.jpg)
    ├── icons/              ← 로고, 아이콘
    └── i18n/
        └── landing.js      ← KO/EN 전체 콘텐츠 (v2.0)
```

---

## 진행 단계

- [x] Phase 0: 프로토타입 제작 (2026-04-03)
  - 수중 실사 사진 배경 슬라이드쇼
  - Season 2 오버레이 + 기능 카드
  - CS 채팅 위젯 연결 (widget.js)
  - 이메일 뉴스레터 섹션

- [x] Phase 1-A: 전면 리디자인 v2.0 (2026-04-03)
  - 교과서적 랜딩페이지 10섹션 구조
  - 행동경제학 + 카피라이팅 전면 적용
  - 밝은 오션 컬러 팔레트 (#0096C7 / #023E8A)
  - Trust Recovery 섹션 (신뢰 회복 심리 전략)
  - Problem / Solution / Credibility / HowItWorks / FAQ 신규 추가
  - KO/EN 이중 언어 완전 지원
  - 스크롤 fade-in 애니메이션

- [x] Phase 2-A: Vercel 배포 (2026-04-03)
  - **라이브 URL**: https://diveroid-landing.vercel.app
  - Vercel 프로젝트 연결 완료
  - 이후 `vercel --prod` 명령으로 즉시 업데이트 가능

- [ ] Phase 1-B: 콘텐츠 완성 (루피 제공 대기)
  - [ ] Universal Pro 실제 제품 이미지 (Solution 섹션 플레이스홀더 교체)
  - [ ] AI 기능 관련 섹션 추가
  - [ ] A/S 및 고객센터 안내 섹션
  - [ ] 카피라이팅 KO/EN 최종 확정
  - [ ] 이메일 수집 API 연결 (Klaviyo / Mailchimp)

- [ ] Phase 2-B: 커스텀 도메인 연결
  - [ ] www.diveroid.com 도메인 관리처 확인 (루피)
  - [ ] Vercel에서 커스텀 도메인 설정

- [ ] Phase 3: 완성 홈페이지로 전환
  - [ ] Shopify 사이트 완성 시 리디렉션 또는 교체

---

## 구현된 섹션 (v2.0)

| #   | 섹션         | 설명                                      | 행동경제학        |
| --- | ------------ | ----------------------------------------- | ----------------- |
| 1   | Hero         | 배경 슬라이드쇼 + "우리가 돌아왔습니다"   | -                 |
| 2   | Trust Bridge | 타임라인 2013→2026 + 이유 카드 3개        | 신뢰 회복 5단계   |
| 3   | Problem      | 다이버 페인포인트 4개 카드                | 손실 회피         |
| 4   | Solution     | 2컬럼, 3개 가치명제 + 제품 이미지 영역    | 앵커링 (100만원+) |
| 5   | Features     | 4개 기능 카드 (hover 애니메이션)          | -                 |
| 6   | Stats        | 40m / 13년 / 500K+ / 6개 언어             | 사회적 증명       |
| 7   | Credibility  | Forbes / 국무총리상 / LG출신HW / 글로벌팀 | 권위              |
| 8   | How It Works | 3단계 원형 숫자                           | 단순성            |
| 9   | FAQ          | 6개 아코디언                              | 불안 해소         |
| 10  | CTA          | 얼리 액세스 이메일 폼                     | 희소성 + FOMO     |

---

## 루피가 제공해야 할 것

| 항목                                   | 상태         |
| -------------------------------------- | ------------ |
| Universal Pro 실제 제품 이미지         | ⏳ 대기 중   |
| AI 기능 관련 내용/이미지               | ⏳ 대기 중   |
| A/S 및 고객센터 안내 내용              | ⏳ 대기 중   |
| DIVEROID 로고 파일 (SVG/PNG)           | ⏳ 대기 중   |
| www.diveroid.com 도메인 관리처         | ❓ 확인 필요 |
| 이메일 수집 서비스 (Klaviyo/Mailchimp) | ❓ 결정 필요 |

---

## 기술 스택

- HTML / CSS / Vanilla JS (단일 파일)
- i18n: `assets/i18n/landing.js` (KO/EN 분리)
- 폰트: Inter (Google Fonts CDN)
- CS 위젯: `web-production-2bc5f.up.railway.app/widget.js`
- 배포: Vercel (자동 HTTPS, 글로벌 CDN)
- 업데이트: `cd diveroid-landing && vercel --prod`

---

## 연구 자료

- 리서치 보고서: `~/Desktop/Projects/루피어벤져스/research/diveroid-landing-page-research.md`
  - 랜딩페이지 교과서적 구조, 행동경제학, 카피라이팅, 신뢰 회복 전략, 무료 이미지 소스 포함
