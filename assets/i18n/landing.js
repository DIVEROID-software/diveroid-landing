/**
 * DIVEROID Landing Page — i18n Content
 * 최종 업데이트: 2026-04-04
 *
 * 텍스트 수정 방법:
 *   1. 이 파일에서 ko / en 섹션 내용을 수정
 *   2. git push → Vercel 자동 배포 → www.diveroid.com 즉시 반영
 *
 * 구조:
 *   badge          — 상단 배지 텍스트
 *   letter.headline — 메인 헤드라인
 *   letter.sub      — 서브 헤드라인
 *   letter.emailBtn — 이메일 구독 버튼 텍스트
 *   letter.csTitle  — CS 섹션 제목
 *   letter.csBody   — CS 섹션 본문
 *   letter.csItems  — CS 항목 목록 [{icon, text, email}]
 *   letter.closing  — 마무리 인사
 *   letter.sign     — 서명
 */
window.LANDING_CONTENT = {
  /* ═══════════ 한국어 ═══════════ */
  ko: {
    nav: { chat: "실시간 상담" },
    badge: "DIVEROID SEASON 2 — Coming Soon",
    letter: {
      headline: "바다를 이해하는 AI",
      sub: "DIVEROID의 새로운 진화가 곧 시작됩니다.",
      emailPlaceholder: "이메일 주소를 입력하세요",
      emailBtn: "가장 먼저 출시 소식 받기",
      csTitle: "💬 언제든 연락 주세요",
      csBody:
        "고객지원은 지금도 정상 운영 중이에요.\n궁금한 점이 있으시면 편하게 연락해 주세요!",
      csItems: [
        {
          icon: "💬",
          text: "화면 오른쪽 하단 상담 버튼을 눌러주세요",
          email: false,
        },
      ],
      closing: "곧 만나요! 🤙",
      sign: "다이브로이드 팀 🤿",
    },
    footer: {
      brand: "오션윅 주식회사 (Oceanwick Inc.) — DIVEROID 브랜드 운영사",
      addr: "서울특별시 강남구 도산대로 145, 11층 1114호 (신사동) · 대한민국",
      biz: "사업자등록번호 716-81-03722 · 법인등록번호 110111-0950517 · 대표이사 김정일 (Kim Jungil)",
      support:
        '고객지원: <a href="mailto:help@diveroid.com">help@diveroid.com</a> · <a href="/support/">Support Center</a>',
      copy: "© 2026 Oceanwick Inc. All rights reserved.",
    },
  },

  /* ═══════════ ENGLISH ═══════════ */
  en: {
    nav: { chat: "Live Chat" },
    badge: "DIVEROID SEASON 2 — Coming Soon",
    letter: {
      headline: "AI Understands the Ocean",
      sub: "DIVEROID's new evolution is coming soon",
      emailPlaceholder: "Enter your email address",
      emailBtn: "Get Early Access",
      csTitle: "💬 We're here for you",
      csBody:
        "Our customer support is fully up and running.\nDon't hesitate to reach out anytime!",
      csItems: [
        {
          icon: "💬",
          text: "Click the chat button in the bottom right corner",
          email: false,
        },
      ],
      closing: "See you soon! 🤙",
      sign: "The DIVEROID Team 🤿",
    },
    footer: {
      brand: "Oceanwick Inc. — operator of the DIVEROID brand",
      addr: "11F-1114, 145 Dosan-daero, Gangnam-gu, Seoul 06036, Republic of Korea",
      biz: "Business Registration No. 716-81-03722 · Corporate Registration No. 110111-0950517 · CEO Kim Jungil",
      support:
        'Support: <a href="mailto:help@diveroid.com">help@diveroid.com</a> · <a href="/support/">Support Center</a>',
      copy: "© 2026 Oceanwick Inc. All rights reserved.",
    },
  },
};
