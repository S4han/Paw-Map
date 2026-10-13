# PAW MAP 개발 기록

## 2026-10-13 — STEP 1 요구사항 정의 (승인)

- 산출물: `docs/requirements.md` v1.0
- 결정: 신규 저장소 `S4han/Paw-Map`, 초기 검증 지역 제주, 기본 목록 필터 "동반 가능만", Q-1(여러 마리는 가장 무거운 아이 몸무게), Q-2(1마리 + 동반 가능이면 마릿수 충족)
- 이슈: 저장소가 공개라 `.gitignore`에 `.env` 차단을 먼저 추가

## 2026-10-13 — STEP 2 데이터 소스 및 API PoC (진행 중)

- 완료
  - 문서 조사: 관광공사 `KorPetTourService2`, Google Places `allowsDogs`·요금, 카카오 로컬·지도, 길찾기 링크, **식약처 반려동물 동반 가능 업소 현황**(신규)
  - PoC 스크립트 `poc/kto_pet.py`, `poc/google_places.py`, `poc/mfds_pet_restaurants.py` 작성, 로컬 mock 서버로 전체 흐름 동작 확인(실제 API 응답 아님)
- 발견
  - 식약처 자료는 자율 등록 업소 목록 → **미등재를 동반 불가로 해석하면 안 됨**(판정 규칙 반영)
  - 식약처 자료 대상 업종(일반·휴게음식점·제과점)이 음식점·카페 카테고리를 함께 커버
- 막힌 점
  - 클라우드 작업 환경 네트워크 정책이 `apis.data.go.kr`, `places.googleapis.com`, `developers.google.com`, `www.foodsafetykorea.go.kr` 등을 차단
  - API 키 없음 → 실측(V-1~V-15) 미실행
- 다음: 사용자 PC에서 PoC 실행 → 결과 요약으로 `api-analysis.md` 확정, 월 0원 판정(Z-1~Z-10)
