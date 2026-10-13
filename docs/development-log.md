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

### 실측 진행 (Codespaces)

- 관광공사 `KorPetTourService2`: Codespaces(해외 IP)에서 정상 호출됨. 제주 `areaCode=39` 22건 vs `lDongRegnCd=50` 330건으로 큰 차이. 제주시청 반경 10km 위치기반 검색 결과 1건 → 위치기반 검색 누락 의심, 전체 목록과 비교하도록 스크립트 보강(재실행 대기)
- 관광공사 상세 필드: `acmpyTypeCd`, `acmpyPsblCpam`, `acmpyNeedMtr`, `etcAcmpyInfo` 확인
- Google: 기존 키가 HTTP 리퍼러 제한 키라 403 → PoC 전용 키 생성 안내(재실행 대기)
- 식약처 파일: 2,813곳, 제주 103곳, 열 5개(식별자·좌표·날짜 없음). xlsx 시트 크기 정보 오류로 읽기 방식 수정
- 관광공사 2차 실측: 위치기반 검색이 구 지역코드 보유 22건만 찾는 것 확정(제주시청 3km 직접 계산 91건 vs API 0건). 제주 숙박 2·음식점 1건뿐. 상세 단계에서 SSL 시간 초과로 중단 → 재시도 추가, 전국·시도별 건수 조사 추가
- Google: 키 끝 `NBTM`이 여전히 리퍼러 제한(`API_KEY_HTTP_REFERRER_BLOCKED`) → 키 교체 확인 요청

