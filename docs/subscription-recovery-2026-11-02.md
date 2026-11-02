# 구독 저장 연결 복구 — 2026-11-02

## 운영 연결

- 홈페이지: GitHub Pages의 `https://www.diveroid.com`
- 구독 API: `https://diveroid-landing.vercel.app/api/subscribe`
- 저장소: DIVEROID 워크스페이스 → User Feedback → Season 2 Early Access — 사전 신청자
- Notion database ID: `ec0b5179-81ca-8247-8258-018de4f6f76d`
- Notion data source ID: `303b5179-81ca-8344-9ffc-077f4ca830cc`

## 확인된 원인과 조치

기존 코드의 저장 대상은 이전 DB `3371717f-b044-81ac-9159-d9b4afedb80e`였다. 운영 서버의 Notion 인증키도 `users/me` 요청에서 401 `unauthorized`를 반환했다. DB 주소만 교체해서는 해결되지 않는 상태였다.

요청받은 DB로 대상 주소를 변경한 기존 커밋을 유지하고, 해당 DB에 접근 가능한 유효한 통합키로 Vercel의 기존 `NOTION_API_KEY` 값을 교체한 뒤 재배포했다. 키 값은 코드, 문서, 로그에 기록하지 않았다. GitHub Actions를 통한 전달용 임시 Secret은 적용 후 삭제했다.

서버는 입력 검증, 10초 저장 요청 제한, 개인정보를 포함하지 않는 오류 코드와 요청 ID 기록을 추가했다. 저장 실패에는 성공 응답을 반환하지 않는다. `node --test test/subscribe.test.mjs` 검증을 일반 배포와 연결 복구 워크플로에 추가했다.

## 기존 데이터와 복구 범위

- 조사 시작 시 요청받은 DB에 기존 신청자 231명, 정규화한 이메일 중복 0건이 있었다.
- 기존 신청일 범위는 2026-04-04부터 2026-08-21까지였다. 해당 행들의 생성일은 2026-08-23에 모여 있었다.
- 조사 중 다른 복구 작업에서 테스트 행 2건이 추가되었다. 기존 신청자로 집계하지 않았으며 수정하거나 삭제하지 않았다.
- Vercel 로그를 최근 7일 조건으로 조회했을 때 실제 반환된 구독 요청은 18건이었다. 그중 인증키 무효로 실패한 요청이 13건이었다. 재시도나 테스트가 포함될 수 있으므로 13명의 신청자 또는 전체 기간의 누락 건수로 해석하지 않는다.
- 반환된 로그에서 이메일 주소는 발견되지 않았다. 기존 API에도 별도 백업 저장 경로가 없다. 확인 가능한 자료에서 추가 신청자 저장본은 찾지 못했다.
- 유효한 새 연결로 이전 DB에 접근하면 404 `object_not_found`를 반환한다. 이는 삭제 또는 권한 부족일 수 있으므로 이전 DB의 잔존 데이터가 없다고 단정할 수 없다.
- 전체 장애 시작 시점과 전체 누락 인원은 현재 자료만으로 확정할 수 없다. 실패 요청의 이메일을 추측하여 재등록하지 않았다.

## 검증

- 인증키 교체 후 Notion 본인 확인과 요청받은 DB 조회 모두 200.
- 2026-11-02 실제 한국어 홈페이지에서 사용자가 제시한 이메일로 1회 제출.
- 화면에 신청 완료 메시지 표시 및 DB에 이메일, 신청일, Language=KO, Source=Landing Page, Status=New 저장 확인.
- 저장 성공, 잘못된 입력, 인증 오류, 네트워크 오류와 시간 초과, 설정 누락, CORS 사전 요청에 대한 테스트 통과.
- [연결 복구 및 운영 배포](https://github.com/DIVEROID-software/diveroid-landing/actions/runs/41401874321)
- [개인정보 없는 저장소·로그 집계](https://github.com/DIVEROID-software/diveroid-landing/actions/runs/41401878051)

## 운영 점검

`Audit subscription storage` 워크플로를 수동 실행하면 인증·DB 접근 상태와 로그 집계만 출력한다. 원본 신청자 이메일과 로그는 출력하지 않는다.

향후 키 교체가 필요하면 GitHub Secret `NOTION_SUBSCRIPTION_REPAIR_TOKEN`에 유효한 키를 안전하게 전달하고 `Restore subscription Notion connection` 워크플로를 실행한다. 이 작업은 DB 접근을 먼저 검증하고 기존 Vercel 환경변수만 수정한 뒤 재배포한다. 성공 후 전달용 Secret을 삭제하고 실제 폼과 DB를 함께 확인한다. Notion 통합 자체의 접근 권한은 별도로 유지되어 있어야 한다.
