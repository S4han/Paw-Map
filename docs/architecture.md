# PAW MAP — 아키텍처 및 화면 설계 (STEP 3)

- 문서 버전: v0.1 (제안, 사용자 승인 대기)
- 작성일: 2026-10-13
- 입력: `docs/requirements.md` v1.0, `docs/api-analysis.md` v1.0
- 표기: **[결정 필요]** = 사용자 승인이 있어야 STEP 4로 갈 수 있는 항목

---

## 1. STEP 2에서 확정된 제약

| 제약 | 근거 | 아키텍처 영향 |
|---|---|---|
| 관광공사 위치기반 검색은 장소를 거의 놓친다 | 제주시청 3km 직접 계산 91건 vs API 0건 | 실시간 "주변 검색" API가 없다 → **지역 목록을 미리 받아 거리 계산** |
| 동반 정보 출처 데이터가 작다 | 제주: 관광공사(쇼핑 제외) 54건 + 식약처 103건. 전국: 관광공사 약 1,000건 + 식약처 2,813건 | 전체를 미리 가공해도 수 MB 수준 → **사전 가공 데이터셋**이 가능 |
| 식약처 자료는 좌표·ID·날짜가 없는 파일 | 실측 | 주소 → 좌표 변환(지오코딩)을 **가공 단계에서 1회** 수행 |
| 관광공사 개발계정 일 1,000건(보고값) | 커뮤니티 기록, 원문 미확인 | 사용자 요청마다 API를 부르면 한도 위험 → 사용자 요청 경로에서 공공 API를 부르지 않는다 |
| Google `allowsDogs` 채움 15%, 최고 등급 과금 | 실측 | Google 유료 SKU 사용 안 함(D-4) |
| 관광공사 API 이용허락범위 "제한 없음" | 공공데이터포털 등록 정보(검색 요약 🔷) | 가공 데이터 저장·배포 가능으로 판단. 이미지 `Type3`은 출처 표시·변경 금지 |
| 식약처 파일 재배포 조건 미확인 | V-15 | **공개 배포 전(STEP 9) 반드시 확인**. 확인 전에는 개발·테스트용으로만 사용 |
| 카카오맵 무료 쿼터는 계정의 첫 번째 활성화 앱에만, 초과 시 429(과금 아님) | 카카오 공지(2026-07-21 적용, 🔷) | 무료량 초과가 과금으로 이어지지 않아 월 0원 목표에 유리. 사용자 계정의 기존 앱 여부 확인 필요 |
| Cloudflare Python Workers 무료 플랜에서 FastAPI가 CPU 10ms 제한으로 실패 | NearMe 운영 기록(2026-10-12) | 런타임 백엔드를 두면 호스팅 대안이 필요 |

---

## 2. 핵심 결정 요약

| # | 결정 | 제안 | 상태 |
|---|---|---|---|
| A-1 | 런타임 구조 | **안 A: 사전 가공 데이터셋 + 브라우저 검색** (런타임 서버 없음) | [결정 필요] |
| A-2 | 지도 SDK | **카카오맵 JS SDK** (대안: Google Maps JS) | [결정 필요] |
| A-3 | 지역 검색 | 카카오 로컬(키워드 장소 검색) — 지도 SDK의 `services` 라이브러리로 브라우저에서 호출 | A-2에 따름 |
| A-4 | 숙소 범위(MVP) | 관광공사 숙박 데이터만 표시하고 "숙소 정보가 적음"을 화면에 명시. 추가 출처는 STEP 6에서 조사 | [결정 필요] |
| A-5 | Python/FastAPI 역할 | 데이터 가공 파이프라인(Pydantic 모델) + 로컬 개발용 API. 런타임 API는 P1(제보) 때 도입 | A-1에 따름 |
| A-6 | 호스팅 | Cloudflare Pages(프론트 + 데이터셋 정적 파일) | A-1에 따름 |
| A-7 | 데이터 갱신 | MVP는 수동 실행(관리자가 가공 스크립트 실행 → 결과 배포). 자동화는 식약처 다운로드 방식 확인 후 | 제안 |

---

## 3. 런타임 구조 비교 (A-1)

| 항목 | **안 A: 사전 가공 + 브라우저 검색 (권장)** | 안 B: FastAPI 검색 API |
|---|---|---|
| 구성 | 가공 파이프라인(Python)이 시도별 JSON 생성 → Cloudflare Pages가 정적 파일로 제공 → 브라우저가 거리·필터·매칭 계산 | 같은 가공 데이터를 FastAPI가 메모리에 올리고 `/api/search` 제공 |
| 런타임 공공 API 호출 | 0 | 0 (동일하게 사전 가공) |
| 월 비용 | Pages 무료 범위(정적 파일) | 서버 호스팅 필요: Python Workers 무료 플랜은 실패 기록, Cloud Run은 무료 범위가 있으나 콜드 스타트 1~3초(NearMe 경험) |
| 속도 | 지역 데이터 1회 다운로드 후 즉시(필터·프로필 변경 시 네트워크 없음) | 검색마다 왕복 |
| 오프라인 | 서비스 워커로 마지막 데이터 재사용 가능 | 불가 |
| 마스터 지침과의 차이 | 런타임 FastAPI가 MVP에 없음 → **지침 변경 승인 필요** | 지침과 일치 |
| 나중에 서버가 필요해질 때 | P1 제보·관리자 검증 시 API 추가(그때 Workers/Cloud Run/D1 결정) | 이미 있음 |
| 위험 | 데이터가 커지면(전국 수만 건) 분할·인덱스 필요. 현재 규모(약 4천 건)는 문제없음 | 호스팅 무료 한도·콜드 스타트 |

**권장 이유:** 실시간으로 불러야 할 외부 API가 없다(STEP 2 결과). 서버 없이도 모든 P0 기능이 동작하고, 월 0원·속도·장애 지점 모두 유리하다. Python·FastAPI·Pydantic은 가공 파이프라인과 데이터 검증에 그대로 쓴다.

> 안 B를 고르면 STEP 4에서 Cloudflare Python Workers PoC를 먼저 하고, 실패 시 Cloud Run(NearMe 방식)으로 간다.

---

## 4. 전체 구성 (안 A 기준)

```
 [가공 파이프라인 — Python 3.11+, Pydantic, 관리자 PC 또는 Codespaces에서 수동 실행]
  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
  │관광공사 어댑터  │  │식약처 어댑터       │  │Google 어댑터(선택)      │
  │areaBasedList2  │  │xlsx 파일 → 정제    │  │Text Search IDs Only    │
  │detailPetTour2  │  │카카오 주소→좌표     │  │→ place ID(링크용)       │
  └───────┬────────┘  └────────┬─────────┘  └───────────┬────────────┘
          └──────────┬─────────┴────────────────────────┘
                     ▼
         정규화(공통 모델) → 조건 파싱 → 카테고리 분류 → 중복 후보 판정
                     ▼
         검증(Pydantic, 규칙 위반·좌표 누락 보고서)
                     ▼
     data/v{버전}/places.{시도코드}.json + manifest.json  (+ 가공 보고서)
                     │ 배포(Cloudflare Pages 정적 파일)
                     ▼
 [브라우저 — React + TS + Vite + Tailwind, PWA]
  위치(GPS)/지역검색(카카오 로컬) → 기준점
  → manifest로 필요한 시도 파일 로드(캐시) → 반경·카테고리·동반 상태 필터
  → 매칭 엔진(프로필) → 지도 마커 + 목록 → 상세(전화·길찾기·Google 지도 링크)
```

### 4.1 시도 파일 선택

- 기준점 + 반경 원이 걸치는 시도 파일만 받는다. `manifest.json`에 시도별 경계 상자(bbox)와 파일 크기·버전을 둔다.
- 10km 반경이 시도 경계를 넘으면 두 파일을 받는다. 제주는 항상 1개.

### 4.2 예상 크기

| 범위 | 건수 | 예상 크기(상세 포함, gzip 전) |
|---|---|---|
| 제주 | 약 160 | 약 150KB |
| 전국 | 약 3,800 | 약 3~4MB → 시도별 분할로 1회 다운로드는 최대 약 1MB(경기) |

---

## 5. 데이터 모델 (확정안)

`requirements.md` §10 제안을 반영했다. TypeScript와 Pydantic에 같은 구조로 정의하고, 가공 파이프라인이 JSON 스키마를 내보내 프론트 타입 검사에 쓴다.

```ts
type Category = 'RESTAURANT' | 'CAFE' | 'STAY' | 'ATTRACTION'
type PetStatus = 'ALLOWED' | 'NOT_ALLOWED' | 'UNKNOWN'
type MatchStatus = 'MATCH' | 'MISMATCH' | 'NEEDS_CONFIRMATION'
type EvidenceType = 'OFFICIAL' | 'BUSINESS_CONFIRMED' | 'PROVIDER' | 'USER_REPORT'
type SourceId = 'KTO_PET' | 'MFDS_PET' | 'GOOGLE'

interface Evidence {
  source: SourceId
  sourceId?: string          // 관광공사 contentid / 식약처는 자체 키(정규화 이름+주소 해시)
  type: EvidenceType
  checkedAt?: string         // 출처가 준 수정·확인일(관광공사 modifiedtime). 식약처는 없음
  fetchedAt: string          // 가공 파이프라인이 받은 시각
  url?: string
  claim: string              // 화면 표시용 요약: "전구역 동반가능", "식약처 동반출입 음식점 등록"
  rawText?: Record<string, string>  // 원문 필드(acmpyPsblCpam 등)
}

interface PetConditions {    // 모든 필드 undefined = 확인 안 됨
  indoorAllowed?: boolean
  outdoorAllowed?: boolean
  maxWeightKg?: number
  maxWeightExclusive?: boolean   // "미만"
  noWeightLimit?: boolean        // "전 견종 동반 가능"(D-7)
  maxDogs?: number
  carrierRequired?: boolean
  leashRequired?: boolean
  additionalFeeKRW?: number
  notes: string[]                // 구조화하지 못한 원문
  fieldSources: Partial<Record<keyof Omit<PetConditions, 'notes' | 'fieldSources'>, SourceId[]>>
  conflicts: string[]            // 출처끼리 값이 다른 필드명
}

interface PetPlace {
  id: string                     // "kto:{contentid}" | "mfds:{hash}" (병합 시 대표 ID + aliases)
  aliases?: string[]
  name: string
  category: Category
  latitude: number
  longitude: number
  address?: string
  phone?: string
  imageUrl?: string
  imageCopyright?: 'Type1' | 'Type3'   // Type3: 출처 표시·변경(자르기 포함) 금지 → object-fit: contain
  petStatus: PetStatus
  petConditions: PetConditions
  evidence: Evidence[]
  conflictingEvidence: boolean
  lastVerifiedAt?: string        // OFFICIAL·BUSINESS_CONFIRMED 근거의 checkedAt 최댓값
  googlePlaceId?: string         // 링크용(선택)
  bookingUrl?: string
}

interface MatchResult {
  status: MatchStatus
  reasons: { field: 'petStatus' | 'weight' | 'dogCount' | 'indoor'; result: 'OK' | 'FAIL' | 'UNKNOWN' | 'CONFLICT'; message: string }[]
}
```

`distanceMeters`는 데이터셋에 넣지 않고 브라우저에서 계산한다.

---

## 6. 가공 파이프라인 상세

### 6.1 관광공사 어댑터

1. `areaBasedList2(lDongRegnCd={시도})` 100건씩 전체 수집(제주 4회).
2. `contenttypeid` 38(쇼핑) 제외. 12·14·28 → `ATTRACTION`, 32 → `STAY`, 39 → `RESTAURANT`/`CAFE`(신분류 `lclsSystm3` 코드표로 카페 판별, 코드표 확인은 STEP 6).
3. 남은 항목마다 `detailPetTour2` 1회(제주 54회). `modifiedtime`이 지난 가공 때와 같으면 재호출 생략(증분).
4. 일 한도 보호: 실행 1회 호출 상한(기본 800) 설정, 넘으면 다음 날 이어서.
5. 이미지: `firstimage` URL만 저장(파일 복제 안 함), `cpyrhtDivCd` 함께 저장.

### 6.2 식약처 어댑터

1. 관리자가 식품안전나라에서 받은 xlsx를 `ingest/input/`에 둔다(저장소에 커밋하지 않음).
2. 주소 정제: 닫히지 않은 괄호·층·호수 제거 → 도로명 주소 본문.
3. 카카오 로컬 **주소 검색 REST API**로 좌표 변환(서버 키는 가공 환경 변수에만). 실패 건은 키워드 검색(업소명 + 시군구)으로 재시도, 그래도 실패하면 보고서에 남기고 데이터셋에서 제외.
4. 분류: `휴게음식점`·`제과점영업` → `CAFE`, `일반음식점` → `RESTAURANT`, 이름에 카페/커피/coffee/베이커리 → `CAFE` 보정.
5. 근거: `type=OFFICIAL`, `claim="식약처 반려동물 동반출입 음식점 등록"`, `checkedAt` 없음, `fetchedAt`=파일 받은 날.
6. 미등재 업소에 대한 어떤 판정도 만들지 않는다.

### 6.3 조건 파싱 (요구사항 §6.3, D-7)

| 원문 | 결과 |
|---|---|
| `N kg 이하` (대소문자·공백 무시) | `maxWeightKg = N` |
| `N kg 미만` | `maxWeightKg = N`, `maxWeightExclusive = true` |
| `전 견종 동반 가능` | `noWeightLimit = true` |
| `N마리까지` | `maxDogs = N` |
| `acmpyTypeCd = 전구역 동반가능` + 실내 업소(음식점·카페·숙소·문화시설) | `indoorAllowed = true` |
| `acmpyTypeCd = 일부구역 동반가능` | `indoorAllowed` 없음 |
| `목줄` / `이동장`·`켄넬` | `leashRequired` / `carrierRequired = true` |
| 그 외(소형견만, 훈련된, 맹견 입마개 등) | `notes`에 원문 |

파서는 출처 원문과 결과를 나란히 담은 **골든 테스트 표**(실측 30건 + 경계 사례)로 고정한다.

### 6.4 중복 판정

- 관광공사 ↔ 식약처: 좌표 50m 이내 **그리고** (정규화 이름 일치 또는 정규화 도로명 주소 일치) → 병합. 한쪽만 맞으면 병합하지 않고 보고서의 "검토 후보"에 올린다.
- 병합 시 근거(evidence)는 모두 유지, `petStatus`·조건은 요구사항 §6.2·§7.3 규칙으로 재계산.

### 6.5 산출물

- `data/v{YYYYMMDD}/places.{시도}.json`, `manifest.json`(버전, 시도별 bbox·건수·크기, 출처별 수집일)
- `reports/ingest-{날짜}.md`: 건수, 좌표 변환 실패, 파싱 결과 분포, 병합·검토 후보, 호출 수. 커밋하지 않음

---

## 7. 브라우저 검색·매칭 흐름

```
사용자 동작 ──▶ 기준점 결정 ──▶ 시도 파일 확보 ──▶ 필터 ──▶ 매칭 ──▶ 렌더
 (GPS 버튼 /     (좌표)         (메모리·서비스워커   (반경·카테    (프로필 있을   (지도 마커
  지역 검색 /                     캐시 → 없으면       고리·동반     때만)          + 목록)
  이 지역 검색)                   네트워크)           상태)
```

| 사용자 동작 | 네트워크 | 다시 계산 |
|---|---|---|
| 앱 첫 실행 | manifest + 기본 지역(제주) 파일 | 전체 |
| GPS / 지역 검색 / "이 지역 검색" | 새 시도 파일이 필요할 때만, 지역 검색은 카카오 로컬 1회 | 전체 |
| 반경·카테고리·동반 상태 필터 변경 | 없음 | 필터부터 |
| 프로필 변경 | 없음 | 매칭만 |
| 지도 이동 | 없음("이 지역 검색" 버튼만 노출) | 없음 |
| 상세 열기 | 이미지 1장 | 없음 |

- 매칭 엔진: `match(place, profile): MatchResult` 순수 함수(`frontend/src/domain/match.ts`), 요구사항 §6 표를 그대로 단위 테스트로 옮긴다.
- 거리: 하버사인, 목록은 거리순 고정.

---

## 8. 오류 처리

| 상황 | 감지 | 사용자 표시 | 동작 |
|---|---|---|---|
| 위치 권한 거부·시간 초과 | Geolocation 오류 코드 | "위치 없이도 지역 검색으로 이용할 수 있어요" | 제주 기본 중심 |
| 데이터 파일 로드 실패 | fetch 실패 | 캐시가 있으면 "최신 정보가 아닐 수 있어요(기준일)", 없으면 재시도 버튼 | 서비스 워커 캐시 사용 |
| 카카오 지도 로드 실패 | SDK 로드 오류 | "지도를 불러오지 못했어요. 목록으로 보여드려요" | **목록 전용 모드**(거리·필터 동작) |
| 카카오 로컬 429(무료량 소진) | HTTP 429 | "지금은 지역 검색을 쓸 수 없어요. 내 위치로 찾거나 잠시 후 다시" | GPS·지도 이동 검색은 계속 동작 |
| 결과 없음 | 0건 | 요구사항 §8.3 | [반경 넓히기] [미확인 포함] |
| 데이터 기준일이 오래됨(30일 초과) | manifest 날짜 | 화면 하단 "정보 기준일 YYYY-MM-DD" 강조 | — |

---

## 9. 비용 통제

| 항목 | 런타임 호출 | 가공 시 호출 | 상한 장치 |
|---|---|---|---|
| 관광공사 | 0 | 제주 약 60회/회(증분 시 더 적음) | 실행당 호출 상한 800 |
| 식약처 | 0 | 0(파일) | — |
| 카카오 로컬(주소 변환) | 0 | 제주 103회, 전국 약 2,800회/회 | 실패 재시도 1회, 결과 캐시(주소→좌표) |
| 카카오 로컬(지역 검색) | 검색 실행 시 1회 | — | 버튼/Enter 실행만, 429 시 기능 비활성 |
| 카카오맵 지도 | 페이지 로드당 1회(문서상 지도 객체 생성 기준) | — | 무료량 초과 시 429(과금 아님) |
| Google | 0 | (선택) Text Search IDs Only — 무료 등급 | 필드마스크 `places.id` 고정, 콘솔 할당량 상한 |
| Cloudflare Pages | 정적 파일 | — | 무료 플랜 범위(STEP 9 확인) |

---

## 10. 보안

- 브라우저에 들어가는 키는 **카카오 JavaScript 키 하나**(카카오 콘솔에서 사이트 도메인 등록으로 제한).
- 카카오 REST 키·공공데이터포털 키·Google 키는 **가공 환경에만**(로컬 환경변수 / Codespaces 시크릿). 프론트 번들에 들어가지 않음을 빌드 산출물 검사로 확인(STEP 9).
- 공개 저장소: `ingest/input/`(원본 파일), `reports/`, `.env*` 커밋 금지.
- 사용자 위치·프로필은 브라우저 밖으로 나가지 않는다(서버가 없으므로 구조적으로 보장). 지역 검색어만 카카오로 전송.

---

## 11. 화면 설계

### 11.1 화면·컴포넌트 구조

```
App
├─ TopBar: 로고 · SearchBox(지역 검색) · LocateButton
├─ FilterBar: CategoryChips · ProfileChip(→ ProfileSheet) · RadiusSelect · PetStatusSelect
├─ MapView: 기준점·내 위치 마커 · PlaceMarkers(겹침 묶음) · SearchHereButton
├─ ResultSheet(하단, 끌어올림)
│   ├─ ResultSummary(건수 · 매칭 칩: 전체/적합/확인 필요/불일치)
│   └─ PlaceCard[]
├─ PlaceDetail(전체 화면 시트, URL /place/:id)
├─ ProfileSheet(몸무게 · 마릿수 · 실내 필수)
└─ StatusBanner(오프라인·데이터 기준일·부분 실패)
```

### 11.2 반려견 조건 시트

```
┌──────────────────────────────┐
│ 내 반려견 조건            ✕   │
│                              │
│ 몸무게                        │
│ [ 12.0 ] kg                  │
│ 여러 마리면 가장 무거운 아이 기준 │
│                              │
│ 마릿수                        │
│ [ − ]   2   [ + ]            │
│                              │
│ 실내에 함께 들어가야 해요  [●━] │
│                              │
│ [초기화]          [적용하기]   │
└──────────────────────────────┘
```

### 11.3 카드의 사유 표시

```
│ 멍멍카페               카페 · 350m │
│ ✅ 동반 가능   🟡 확인 필요          │
│ 마릿수 정보 없음 · 실내 가능 ✓        │   ← MatchResult.reasons 중 UNKNOWN/FAIL 먼저
│ 한국관광공사 · 수정 2026-08-01        │
```

### 11.4 숙소 정보 부족 안내 (A-4)

숙소 카테고리를 선택하면 목록 위에 한 줄 고정:
`ⓘ 반려견 동반 숙소 공식 정보가 아직 적어요(제주 2곳). 예약 전 숙소에 꼭 확인하세요.`

메인·상세 와이어프레임과 예외 상태 표시는 `requirements.md` §8을 그대로 따른다.

---

## 12. 디렉터리 구조 (STEP 4에서 생성)

```
paw-map/
├── CLAUDE.md
├── frontend/                # React + TS + Vite + Tailwind, PWA
│   └── src/
│       ├── components/  pages/  hooks/
│       ├── domain/          # match.ts, distance.ts, filters.ts (순수 함수 + Vitest)
│       ├── services/        # dataset.ts(manifest·시도 파일 로드), kakao.ts
│       └── types/           # 데이터셋 JSON 스키마에서 생성한 타입
├── ingest/                  # Python 3.11+, Pydantic (pytest)
│   ├── pawmap_ingest/
│   │   ├── models.py        # 공통 모델
│   │   ├── sources/kto.py  mfds.py  google.py
│   │   ├── parse.py  classify.py  dedupe.py  build.py
│   │   └── cli.py
│   ├── input/               # 원본 파일(커밋 금지)
│   └── tests/
├── data/                    # 가공 결과(배포 대상). 식약처 재배포 조건 확인 전에는 커밋 보류
├── poc/                     # STEP 2 검증 스크립트(보존)
└── docs/
```

> 안 B를 고르면 `backend/`(FastAPI)가 추가되고 `ingest/`의 모델을 공유한다.

---

## 13. 월 0원 판정 갱신

| # | 항목 | 판정 |
|---|---|---|
| Z-1 | 관광공사 | **가능** — 런타임 호출 0, 가공 시 제주 약 60회 |
| Z-2 | 식약처 | 비용은 0. **재배포 조건 미확인**(공개 전 필수) |
| Z-3·Z-4 | Google | 가능(무료 등급만 또는 미사용) |
| Z-5 | 지도 SDK | **조건부 가능** — 카카오: 첫 번째 앱 조건 충족 시 무료, 초과는 429. Google: 월 10,000 로드 |
| Z-6 | 지오코딩 | **조건부 가능** — 카카오 로컬, 위와 같은 조건 |
| Z-7 | 백엔드 | 안 A면 **해당 없음(0원)** |
| Z-8 | 프론트 호스팅 | Cloudflare Pages 무료 플랜 — STEP 9 확인 |
| Z-10 | 캐시·저장 | 관광공사 "제한 없음"(🔷), 식약처 미확인 |

---

## 14. 결정 요청 목록

| # | 질문 | 제안 |
|---|---|---|
| A-1 | 런타임 구조 | **안 A** (마스터 지침의 "런타임 FastAPI 백엔드"를 P1로 미루는 변경) |
| A-2 | 지도 SDK | **카카오맵** — 한국 지도 상세·지역 검색과 같은 공급자·초과 시 과금 없음. 단 카카오 개발자 계정에 이미 카카오맵을 켠 앱이 있으면 그 앱이 무료 대상이므로 확인 필요. 그런 앱이 있으면 Google Maps JS(NearMe 키와 별도 키) |
| A-4 | 숙소 범위 | 관광공사 데이터만 + 부족 안내, 추가 출처는 STEP 6에서 조사 |
| 확인 | 카카오 개발자 계정에 카카오맵 API를 활성화한 앱이 이미 있는지 | — |
