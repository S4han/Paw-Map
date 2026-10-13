# PAW MAP — API 분석 (STEP 2 사전 조사, 미승인)

> **상태: STEP 2 승인 전 사전 조사 초안.** 마스터 지침 v0.1 시점에 웹 검색만으로 작성했으며 실제 호출 검증은 하지 않았다. 마스터 지침 v0.2에서 추가된 **식품의약품안전처 반려동물 동반출입 음식점 공개 자료는 아직 조사하지 않았다.** STEP 2에서 이 문서를 출발점으로 다시 검증·보완한다.

- 문서 버전: v0.1 (문서 조사만 완료, **실제 호출 검증 전**)
- 작성일: 2026-10-13
- 범위: 한국관광공사 반려동물 동반여행 API, Google Places API(New), 지도·지오코딩·길찾기 링크 후보
- 다음 작업(2차): API 키·네트워크 허용 후 실제 호출로 이 문서의 **모든 ⚠️·❓ 항목**을 확인하고 응답 샘플을 첨부한다.

## 0. 조사 방법과 신뢰도 표기

이 작업 환경의 네트워크 정책이 `developers.google.com`, `www.data.go.kr`, `apis.data.go.kr`, `api.visitkorea.or.kr`, `developers.kakao.com` 접속을 차단하여(2026-10-13 확인) **공식 페이지 원문을 직접 열지 못했다.** 웹 검색 결과(검색 엔진이 공식 페이지를 요약·인용한 것)만으로 조사했으므로 아래 등급으로 구분한다.

| 표기 | 의미 | 개발에 쓰는 기준 |
|---|---|---|
| 🔷 | 공식 페이지를 검색 요약으로 확인(원문 미열람) | 설계에 반영하되 2차에서 원문·실호출로 재확인 |
| ⚠️ | 개발자 커뮤니티·타 프로젝트 기록(GitHub 이슈 등) | 가설로만 사용. 반드시 실호출로 확인 |
| ❓ | 확인 못 함 | 사용 금지. 2차 검증 대상 |

요금은 모두 USD·VAT 별도, 2026-10-13 조사 시점 기준이다. **실제 과금 판단은 Google Cloud 콘솔의 가격표와 결제 보고서로만 한다.**

---

## 1. 한국관광공사 — 반려동물 동반여행 서비스

### 1.1 서비스 식별

| 항목 | 내용 | 신뢰도 |
|---|---|---|
| 서비스명 | 한국관광공사_반려동물 동반여행 서비스 (공공데이터포털 15135102) | ⚠️ (여러 프로젝트가 같은 번호 인용) |
| 서비스 ID | `KorPetTourService2` | ⚠️ |
| 기본 URL | `https://apis.data.go.kr/B551011/KorPetTourService2` | ⚠️ |
| 주의 | 서비스·오퍼레이션 이름 끝의 `2`를 빠뜨리면 400 오류 | ⚠️ |
| 인증 | 공공데이터포털 일반 인증키(`serviceKey`). 서비스별 **활용신청 필요** — 국문 관광정보(`KorService2`)와 별도 신청·별도 한도 | ⚠️ |
| 관련 서비스 | 국문 관광정보(`KorService2`, 15101578) 설명에도 "반려동물 동반여행정보" 포함 문구가 있음 | 🔷 |

### 1.2 오퍼레이션(가설)

| 오퍼레이션 | 용도 | PAW MAP 사용처 | 신뢰도 |
|---|---|---|---|
| `locationBasedList2` | 좌표·반경 기반 목록 | **FR-001/004 주변 검색의 주 데이터원** | ⚠️ |
| `areaBasedList2` | 지역코드 기반 목록 | 지역 전체 조회(필요 시) | ⚠️ |
| `searchKeyword2` | 키워드 검색 | 장소명 검색 보조 | ⚠️ |
| `detailPetTour2` | 반려동물 동반 조건 상세 | **FR-007/009 상세 화면** | ⚠️ |
| 공통정보·이미지 조회 오퍼레이션 | 주소·전화·홈페이지·이미지 | 상세 화면 | ❓ (이름·존재 여부 미확인) |

- 반경 파라미터 상한, 페이지 크기 상한, `arrange`(거리순 정렬) 지원 여부: ❓ → 2차 확인. (국문 TourAPI 경험상 위치기반 반경 상한이 있었던 것으로 기억하나 **검증 전이므로 사용하지 않음**.)
- 제주 지역코드: `areaCode=39`와 법정동 코드(`lDongRegnCd=50`) 체계가 혼재하며, 코드 이관으로 제주 장소가 누락된 사례 보고 ⚠️ → 2차에서 두 방식의 `totalCount` 비교.
- 전국 목록 규모 약 9,684건이라는 기록 ⚠️ (시점 불명).

### 1.3 반려동물 동반 조건 필드(`detailPetTour2`)

| 필드 | 의미(보고된 값 예시) | PetPlace 매핑안 | 신뢰도 |
|---|---|---|---|
| `acmpyTypeCd` | 동반 유형 — "전구역 동반가능", "일부구역 동반가능" | `petStatus`·`indoorAllowed` 판단 근거 | ⚠️ |
| `acmpyPsblCpam` | 동반 가능 동물 — "5kg 이하 동반 가능(이동장 이용 필수)" | 크기별 허용(`small/medium/largeDogsAllowed`) | ⚠️ |
| `acmpyNeedMtr` | 동반 시 필요사항 — "목줄 착용, 반려동물 유모차 탑승, 이동장(켄넬)사용" | `leashRequired`, `carrierRequired` | ⚠️ |
| `relaAcdntRiskMtr` 등 `rela*` 계열 | 관련 사고 대비 사항 등. 샘플 110건 중 51건이 `acmpyPsblCpam`과 같은 원문이었다는 보고 | `notes`(원문 보관만) | ⚠️ |
| 그 외(총 약 9개 필드) | 미확인 | — | ❓ |

**설계 영향**
1. 보고된 모든 조건 필드가 **자유 텍스트**다 ⚠️ → 구조화 필드(`smallDogsAllowed` 등)는 **명확한 패턴만** 규칙 파싱하고, 나머지는 원문을 `notes`로 그대로 보여준다(요구사항 FR-009와 일치).
2. 동반 정보가 없는 콘텐츠는 `items`가 객체가 아닌 **빈 문자열 `""`** 로 온다 ⚠️ → 파서가 문자열/객체/배열을 모두 처리해야 한다(공공데이터 API 공통 함정).
3. "일부구역 동반가능"은 `ALLOWED`로 볼지 논의 필요 → **제안: `ALLOWED` + 조건 요약에 "일부 구역만" 표시.** "전구역"과 구분해 보여준다.
4. 전용 서비스 목록에 실려 있다는 사실 자체가 동반 가능 근거인지(목록 = 동반 가능 장소 모음인지) ⚠️ → 2차에서 목록 항목 중 `detailPetTour2`가 "동반 불가"를 주는 사례가 있는지 확인. 확인 전에는 **상세 근거가 있을 때만 `ALLOWED`**.

### 1.4 카테고리 매핑(가설)

| PAW MAP | TourAPI `contentTypeId` | 신뢰도 |
|---|---|---|
| 관광지 `ATTRACTION` | 12 (관광지). 문화시설 14, 레포츠 28 포함 여부는 결정 필요 | ❓ (기억 기반) |
| 숙소 `STAY` | 32 (숙박) | ❓ |
| 음식점 `RESTAURANT` | 39 (음식점) | ❓ |
| 카페 `CAFE` | 39 중 소분류(카페·전통찻집, 코드 `A05020900`로 기억) | ❓ |

→ 2차에서 실제 응답의 `contenttypeid`, `cat1~3`(또는 신분류 체계) 값을 수집해 확정.

### 1.5 한도·이용조건

| 항목 | 내용 | 신뢰도 |
|---|---|---|
| 개발계정 호출 한도 | **일 1,000건** | ⚠️ |
| 운영계정 | 활용사례 등록 후 증량 신청 가능(일반적인 data.go.kr 절차) | ❓ |
| 데이터 이용조건(공공누리 유형) | 미확인. 이미지별 저작권 구분 필드(`cpyrhtDivCd`) 존재로 기억 | ❓ |
| 저장·캐싱 | 이용조건 확인 전에는 **영구 저장 금지, 메모리 단기 캐시만** | — |

**한도 영향 계산(가정: 검색 1회 = 목록 1회 호출, 상세 열람 = 1~2회 호출)**
- 일 1,000건이면 하루 약 300회 검색 + 300회 상세 열람 수준.
- 개인·소규모 테스트에는 충분, 공개 운영에는 **서버 캐시(동일 좌표 격자·반경 요청 재사용) + 운영계정 증량**이 필요.

---

## 2. Google Places API (New)

### 2.1 `allowsDogs` 필드

| 항목 | 내용 | 신뢰도 |
|---|---|---|
| 필드 존재 | `allowsDogs` (Place Details / Text Search / Nearby Search 모두 요청 가능) | 🔷 |
| 과금 등급 | 세 API 모두 **Enterprise + Atmosphere** 등급 | 🔷 |
| 값이 없을 때 동작 | 필드 생략 여부 미확인 | ❓ |
| **한국 장소의 채움 비율** | 자료 없음 | ❓ **(가장 중요한 미확인 사항)** |

→ 2차에서 제주의 알려진 반려견 동반 카페·숙소 20곳 이상에 대해 `allowsDogs` 반환 여부를 실측한다. 채움 비율이 낮으면 Google을 동반 정보 출처로 쓰는 의미가 없다.

### 2.2 요금·무료 사용량(2025-03-01 이후 체계)

- 기존 월 $200 크레딧은 폐지되고 **SKU별 월 무료 사용량**으로 바뀜 🔷. 일반적으로 Essentials 10,000 / Pro 5,000 / Enterprise 1,000건, 매월 1일(태평양시) 초기화 🔷.
- 무료량은 **SKU끼리 합산되지 않음** 🔷.

| SKU | 월 무료 | 초과 시(1,000건당, 첫 구간) | 신뢰도 |
|---|---|---|---|
| Place Details Essentials (IDs Only) | 무제한 | — | 🔷 |
| Text Search Essentials (IDs Only) | 무제한 | — | 🔷 |
| Place Details Essentials | 10,000 | $5.00 | 🔷 |
| Place Details Pro | 5,000 | $17.00 | 🔷 |
| Place Details Enterprise | 1,000 | $20.00 | 🔷 |
| Place Details Enterprise + Atmosphere | 1,000(추정) | $25.00 | ⚠️ (제3자 자료) |
| Nearby Search Pro | 5,000 | $32.00 | 🔷 |
| Nearby Search Enterprise | 1,000 | $35.00 | 🔷 |
| **Nearby Search Enterprise + Atmosphere** | **1,000** | **$40.00** | 🔷 |
| Dynamic Maps (지도 JS 로드) | 10,000 | $7.00 | 🔷 |
| Geocoding, Text Search Pro 이상, Place Photos | 미확인 | 미확인 | ❓ |

- 한 요청에서 가장 비싼 필드의 등급으로 과금된다(필드 마스크 기준) — Places API(New) 일반 원칙으로 알려져 있으나 이번 조사에서 원문 확인 못 함 ❓.

### 2.3 비용 시나리오

| 방식 | 월 무료로 가능한 횟수 | 판단 |
|---|---|---|
| A. 검색마다 Nearby Search에 `allowsDogs` 포함, 4개 카테고리 각 1회 | 1,000 ÷ 4 = **월 250회 검색** | ❌ 무료 운영 불가 수준. 초과 시 1,000건당 $40 |
| B. 검색은 Nearby Search **Pro**(동반 정보 없이), 상세 진입 시만 Place Details E+A로 `allowsDogs` | 검색 1,250회(5,000÷4) + 상세 약 1,000회 | △ 동반 정보가 목록에 안 나오므로 "동반 가능만" 필터(D-3)와 충돌 |
| C. **TourAPI만으로 목록**, 상세에서 Google로 보강하지 않음 | Google 장소 API 0건 | ✅ 비용 0. 데이터 범위는 TourAPI에 한정 |
| D. C + TourAPI 장소를 Text Search **IDs Only**(무료)로 Google place ID에 매칭해 "Google 지도에서 보기" 링크만 제공 | 무제한(IDs Only) | ✅ 비용 0. 매칭 정확도 검증 필요 |

### 2.4 캐싱 약관

- Google Maps 서비스 약관: 지도 콘텐츠 캐싱 일반 30일 제한, Geocoding·Directions의 위경도는 최대 30일 임시 캐싱, place ID는 캐싱 허용 🔷.
- Places API 전용 조항 원문 미확인 ❓ → **place ID만 저장 가능**으로 보수적으로 가정하고, 이름·주소·`allowsDogs` 등은 저장하지 않는다.

---

## 3. 지도·지오코딩·길찾기 링크

### 3.1 지도 SDK

| 후보 | 무료 범위 | 장단점 | 신뢰도 |
|---|---|---|---|
| Google Maps JS | Dynamic Maps 월 10,000 로드 | NearMe 코드 재사용 가능. 한국 지도 표현은 국내 서비스보다 상세도 낮음 | 🔷 |
| 카카오맵 JS SDK | 무료 쿼터는 **개발자 계정의 첫 번째 카카오맵 활성화 앱에만** 제공. 지도 객체 생성 시 1건 차감(타일은 미차감), 초과 0.1원/건 | 국내 POI·도로 상세. 일 무료 수치 원문 미확인 | 🔷/⚠️ |

### 3.2 지역 검색(지오코딩) — FR-002

| 후보 | 무료 범위 | 신뢰도 |
|---|---|---|
| 카카오 로컬 API(키워드 장소 검색, 좌표↔주소 변환) | API별 **일 100,000건**, 전체 월 3,000,000건. 초과 시 키워드 검색 2원/건 | 🔷 |
| 카카오 로컬 "주소로 좌표 변환" | 쿼터표에서 별도 행 확인 못 함 | ❓ |
| Google Geocoding / Text Search Pro | 미확인 | ❓ |

→ **제안: 지역·주소·관광지명 검색은 카카오 로컬 키워드 검색**(한국 지명·관광지명 정확도, 넉넉한 무료량). 단, "첫 활성화 앱에만 무료" 조건 때문에 사용자의 카카오 개발자 계정에 이미 카카오맵을 쓰는 앱이 있는지 확인 필요.

### 3.3 외부 길찾기 링크 — FR-007

| 대상 | 형식 | 신뢰도 |
|---|---|---|
| 카카오맵 웹 | `https://map.kakao.com/link/to/{이름},{위도},{경도}` (위도 먼저) | 🔷 |
| 카카오맵 앱 | `kakaomap://route?ep={위도},{경도}&by=CAR` | ⚠️ |
| 네이버지도 앱 | `nmap://route/car?dlat=…&dlng=…&dname=…&appname=…` | ❓ (기억 기반) |
| 네이버지도 웹 | 미확인 | ❓ |

→ MVP는 **웹 링크 우선**(앱이 설치돼 있으면 OS가 앱으로 열어줌), 앱 스킴은 실기기 테스트 후 추가.

---

## 4. 1차 결론과 제안

1. **반려견 동반 정보의 주 출처는 한국관광공사 `KorPetTourService2`로 한다.** 동반 조건을 직접 주는 유일한 후보이며 비용이 없다. 단, 조건이 자유 텍스트이고 일 1,000건 한도(개발계정)가 있어 캐시가 필수다.
2. **D-4(Google 활용 범위) 제안: 시나리오 C 또는 D.** `allowsDogs`는 Enterprise + Atmosphere 등급이라 목록 검색에 쓰면 월 약 250회 검색에서 무료량이 끝난다(시나리오 A). 한국 장소 채움 비율도 미확인. 2차 실측에서 채움 비율이 높게 나오면 "상세 화면에서만 보강"(시나리오 B 변형)을 재검토한다.
3. **지역 검색은 카카오 로컬 API, 지도는 Google Maps JS(NearMe 재사용) 유지**를 1안으로 제안. 카카오맵으로 지도까지 통일하는 2안은 무료 쿼터 조건 확인 후 비교.
4. 모든 유료 가능 API는 **콘솔에서 일일 쿼터 상한**을 걸어 무료량을 넘지 못하게 한다(NFR-01).

---

## 5. 2차 검증 체크리스트(키·네트워크 준비 후)

| # | 항목 | 방법 |
|---|---|---|
| V-1 | `KorPetTourService2` 오퍼레이션·파라미터·응답 구조 | 공식 명세서 원문 + 실호출 |
| V-2 | 제주(`areaCode=39` vs `lDongRegnCd=50`) 목록 건수, 콘텐츠 유형별 건수 | `totalCount` 집계 |
| V-3 | `locationBasedList2` 반경 상한·정렬·페이지 크기 | 실호출 |
| V-4 | `detailPetTour2` 필드 전체 목록, 채움 비율, 빈 응답 형태 | 제주 샘플 50건 |
| V-5 | 목록에 있지만 상세가 "동반 불가"인 사례 존재 여부 | V-4 데이터 |
| V-6 | 카페 분류 코드, 숙소 세부 유형 표현 | 실응답 `cat`/분류 필드 |
| V-7 | 이용조건(공공누리 유형), 이미지 저작권 구분 | 포털 이용허락범위 + 응답 필드 |
| V-8 | Google `allowsDogs` 한국 채움 비율 | 제주 동반 가능 장소 20곳 이상 Place Details 실호출(무료량 안에서) |
| V-9 | Google 요금표 원문(E+A Place Details, Photos, Geocoding) | Cloud 콘솔 가격표 |
| V-10 | Text Search IDs Only로 TourAPI↔Google 매칭 정확도 | 샘플 20건 |
| V-11 | 카카오 로컬·지도 무료 쿼터 적용 여부(계정 첫 앱 조건) | 카카오 개발자 콘솔 |
| V-12 | 네이버·카카오 길찾기 링크 동작 | iOS·Android 실기기 |

### 2차 검증에 필요한 준비물

1. 공공데이터포털 인증키 + "한국관광공사_반려동물 동반여행 서비스" 활용신청 승인
2. Google Maps Platform API 키(Places API (New) 사용 설정, 일일 쿼터 상한·결제 알림 설정 후)
3. (선택) 카카오 REST API 키
4. 작업 환경 네트워크 허용 도메인: `apis.data.go.kr`, `places.googleapis.com`, `dapi.kakao.com`, 그리고 문서 열람용 `developers.google.com`, `www.data.go.kr`, `api.visitkorea.or.kr`, `developers.kakao.com`
5. 키는 채팅이 아닌 환경 변수(시크릿)로 등록: `DATA_GO_KR_SERVICE_KEY`, `GOOGLE_PLACES_API_KEY`, `KAKAO_REST_API_KEY`

---

## 참고 자료(검색으로 확인한 출처)

- 공공데이터포털 국문 관광정보 서비스: https://www.data.go.kr/data/15101578/openapi.do
- 반려동물 동반여행 서비스(타 프로젝트가 인용한 공식 페이지): https://www.data.go.kr/data/15135102/openapi.do
- 한국관광콘텐츠랩(TourAPI): https://api.visitkorea.or.kr/
- `KorPetTourService2` 필드·한도 기록(커뮤니티): https://github.com/8llow8llowMe/hondigagae/issues/877 , https://github.com/UnohNam/petpass , https://github.com/tourlint/tourlint/issues/378 , https://github.com/bot052/DANGJEJU_2/pull/35 , https://github.com/Pic-N-Go/PNG_backend/pull/130
- Google Places 필드 등급: https://developers.google.com/maps/documentation/places/web-service/data-fields
- Google 가격표: https://developers.google.com/maps/billing-and-pricing/pricing
- Google 요금 FAQ: https://developers.google.com/maps/billing-and-pricing/faq
- Google Maps 서비스 약관: https://cloud.google.com/maps-platform/terms/maps-service-terms
- 카카오 쿼터: https://developers.kakao.com/docs/latest/ko/getting-started/quota
- 카카오맵 API 공통: https://developers.kakao.com/docs/latest/ko/kakaomap/common
- 카카오맵 앱 스킴 문의: https://devtalk.kakao.com/t/topic/150884
