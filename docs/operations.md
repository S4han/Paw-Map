# PAW MAP — 배포·운영 안내 (STEP 9)

- 작성일: 2026-10-13
- 구조: 서버 없음(안 A). 가공된 시도별 JSON + 프론트 빌드 결과를 **Cloudflare Pages에 정적 파일로 직접 업로드**한다.
- 표기: 🔷 문서·검색 확인, ❓ 미확인 — 요금·한도는 각 콘솔에서 다시 확인한다.

---

## 1. 공개 범위 결정 (D-8)

> **결정: 안 A — 전체 공개(사용자 확인 "공개해도 이상 없음", 2026-10-13).** 화면 하단에 각 출처의 기관명·원문 링크·수집일을 표시한다. 이용조건이 바뀌면 이 결정을 다시 검토한다.

실데이터의 식약처 자료는 **재배포 조건을 아직 확인하지 못했다**(api-analysis V-15). 관광공사 API는 공공데이터포털 등록 정보상 이용허락범위 "제한 없음"(🔷).

| 안 | 내용 | 장단점 |
|---|---|---|
| **A. 식약처 조건 확인 후 전체 공개** | 식품안전나라 하단 "저작권 정책"·이용약관 확인 또는 식약처(국민신문고) 문의 → 허용이면 관광공사 + 식약처 공개 | 정식 서비스 형태. 확인 기간 필요 |
| B. 관광공사만 공개 | `--mfds` 없이 가공 → 관광지 51·숙소 2·카페 1곳 | 바로 공개 가능하나 음식점·카페가 거의 없음 |
| **C. 비공개 테스트 배포(권장: A 확인 전까지)** | 전체 데이터로 배포하되 Cloudflare Access 로 본인 이메일만 접속 허용 | 휴대폰 현장 검증 가능, 공개 재배포 아님. Access 무료 범위 확인 필요 ❓ |

---

## 2. 최초 배포 (Codespaces 에서)

### 2.1 준비 (한 번)

1. Cloudflare 가입 → **Workers & Pages → Create → Pages → Direct Upload** 로 프로젝트 `paw-map` 생성(빈 폴더 업로드 없이 이름만 만들어도 됨).
2. Cloudflare **API 토큰** 생성: My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" 템플릿 또는 사용자 지정(권한: Account · Cloudflare Pages · Edit). 
3. GitHub 저장소 Settings → Secrets → **Codespaces** 에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`(Cloudflare 대시보드 오른쪽의 Account ID), `VITE_KAKAO_JS_KEY` 등록 → 코드스페이스 재시작.
4. 카카오 콘솔 → 앱 → 플랫폼 키 → JavaScript SDK 도메인에 **실제 배포 주소** 추가. `pages.dev` 이름은 전 세계에서 하나라 이미 쓰인 경우 뒤에 문자가 붙는다(실제: `https://paw-map-1bi.pages.dev`, 2026-10-14 사용자 확인). 정확한 주소는 아래 명령의 `subdomain` 으로 확인한다:
   `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/paw-map" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['subdomain'])"`. 첫 배포 출력·Pages 프로젝트 화면의 주소를 그대로 등록한다.
5. (안 C) Cloudflare Zero Trust → Access → Applications → Self-hosted → 도메인 = 프로젝트 주소, 정책: 본인 이메일만 Allow.

### 2.2 배포 명령

```bash
cd /workspaces/Paw-Map

# 1) 데이터 가공(안 B면 --mfds 두 인자를 뺀다)
cd ingest && .venv/bin/pawmap-ingest build --region 50 --out ../frontend/public/data/live \
  --mfds input/dogs_info.xlsx --mfds-date YYYY-MM-DD \
  --kcisa input/kcisa_data.csv --kcisa-date YYYY-MM-DD && cd ..
# --kcisa: 한국문화정보원 반려동물 동반 시설 CSV(공공데이터포털 15111389, 이용허락범위 제한 없음 — 2026-10-14 사용자 확인). --kcisa-date 는 파일을 받은 날

# 2) 검사 → 빌드 → 키 노출 검사
cd frontend
npm test
VITE_DATASET_BASE=/data/live npm run build
npm run check:secrets

# 3) 업로드(Direct Upload)
npx --yes wrangler@4 pages deploy dist --project-name paw-map --branch main
```

- **한 블록씩 실행하고, 앞 단계가 실패하면 다음 단계로 가지 않는다.** 여러 줄을 한꺼번에 붙여넣으면 뒤 명령이 앞 명령의 질문(y/n)에 입력되어 엉뚱하게 취소·진행될 수 있다(2026-10-13 발생).
- 새 코드스페이스에는 `ingest/input/` 의 식약처 xlsx 가 없다(커밋하지 않는 파일) → 다시 올린 뒤 가공한다.
- `public/data/live/`는 커밋하지 않지만 빌드 결과(`dist/`)에는 들어가 업로드된다 → **공개 범위(§1)를 정한 뒤에만** 실행한다.
- 업로드 출력의 `https://<8자리>.<프로젝트 주소>` 는 **배포마다 새로 생기는 미리보기 주소**라 카카오 도메인에 등록되어 있지 않아 지도가 뜨지 않는다(2026-10-13 확인). 점검·공유는 항상 고정 주소(프로젝트 `subdomain`, §2.1-4) 로 한다. 배포마다 주소를 카카오에 추가하지 않는다.
- 새 프로젝트·새 주소는 HTTPS 인증서 발급에 수 분~수십 분이 걸려 그동안 `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` 가 날 수 있다(2026-10-13 발생) → 기다렸다가 다시 접속.
- `--branch` 가 프로젝트의 **프로덕션 브랜치**와 같아야 기본 주소(`프로젝트.pages.dev`)에 반영된다. 다르면 미리보기(`Preview`)로만 올라가 기본 주소는 "Nothing is here yet" 이 된다. wrangler 가 프로젝트를 처음 만들 때 **그때의 git 브랜치 이름**을 프로덕션 브랜치로 잡는다(2026-10-13: `claude/step9-release` 로 잡혀 있었음 → `main` 으로 변경).
  ```bash
  # 확인
  curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/paw-map" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['production_branch'])"
  # main 으로 변경
  curl -s -X PATCH -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d '{"production_branch":"main"}' "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/paw-map" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['success'], r['result']['production_branch'] if r['success'] else r['errors'])"
  ```
  배포 목록의 `Environment` 가 `Production` 인지로 확인: `npx --yes wrangler@4 pages deployment list --project-name paw-map`

### 2.3 자동 배포 (GitHub Actions, `.github/workflows/deploy.yml`)

- **언제:** `main` 에 코드가 들어올 때(PR 병합 등) + Actions 화면에서 수동 실행(Run workflow).
- **무엇을:** 단위 테스트 → Cloudflare 에서 프로젝트 주소 읽기 → 그 주소의 현재 실데이터 받기(`scripts/fetch-live-data.mjs`) → `pawmap-ingest validate` → 빌드 → 키 노출 검사 → `--branch main` 배포. 하나라도 실패하면 배포하지 않는다.
- **데이터는 자동 갱신하지 않는다.** 식약처 xlsx 는 사람이 내려받아야 하고 실데이터는 저장소에 두지 않으므로, 데이터 갱신은 §2.2 수동 절차 그대로. 자동 배포는 운영 중인 데이터를 그대로 이어 쓴다.
- **준비(한 번):** 저장소 Settings → Secrets and variables → **Actions** → New repository secret 으로 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_KAKAO_JS_KEY` 등록. Codespaces 시크릿과는 따로 등록해야 한다. 서버 키(공공데이터·카카오 REST)는 넣지 않는다.
- 포크에서 온 PR 에는 시크릿이 전달되지 않고, 이 워크플로는 PR 에서 실행되지 않는다.
- GitHub Actions 사용량: 공개 저장소의 표준 러너는 무료로 안내됨(🔷, GitHub 문서) — 요금 정책은 Settings → Billing 에서 확인.

---

## 3. 정기 운영

| 주기 | 작업 | 방법 |
|---|---|---|
| 월 1회(권장) | 데이터 갱신 | 식품안전나라에서 xlsx 새로 받기 → §2.2 전체 실행. 관광공사 상세는 수정일이 같으면 캐시 재사용 |
| 갱신 때마다 | 가공 보고서 확인 | `reports/ingest-*.md`: 좌표 변환 실패, 병합·검토 후보, 파싱 경고, 카테고리 분포 |
| 월 1회 | 무료 사용량 확인 | 카카오 콘솔 → 통계 → 쿼터(지도·로컬). 공공데이터포털 → 마이페이지 → 활용 현황. Cloudflare → Pages 프로젝트 분석 |
| 수시 | 오류 신고·정보 변경 | 상세 화면 "정보 수정 제보하기" → 저장소 Issues(제목 `[정보 제보] 장소명`, 본문에 장소 ID). 데이터 갱신 때 열린 제보를 확인하고, 반영 여부를 이슈에 남긴 뒤 닫는다. 제보만으로 판정을 바꾸지 않는다(출처 확인 후 반영). 개인정보가 올라오면 해당 부분을 지운다 |

### 무료 운영 장치

- 런타임 서버 없음 → 사용자 요청마다 호출되는 유료 API 없음.
- 카카오: 무료량 초과 시 **429 오류로 멈춤(과금 아님)** — 비즈월렛·유료 설정을 하지 않는다(🔷 카카오 공지 2026-07-21).
- 관광공사: 가공 1회 약 60회 호출(일 1,000건 한도 보고값 ⚠️).
- Google: 사용 안 함(D-4). PoC 전용 키는 삭제.
- Cloudflare Pages 정적 호스팅 무료 범위 ❓ — 대시보드 요금제 화면에서 확인.

## 4. 배포 후 점검표

> 2026-10-13 첫 배포: 사용자가 PC·iPhone 에서 전 항목 확인 완료(지도 relayout 수정·프로덕션 브랜치 정정 후).

- [x] 첫 화면: 노란 "가상 데이터" 띠가 **없고**, 하단에 "자료: 한국관광공사(…), 식약처(…)"
- [x] 지도 표시(카카오 도메인 등록 확인), 내 위치 버튼 권한 요청
- [x] 지역 검색 후보 표시
- [x] 조건 설정 → 매칭 배지·필터
- [x] 상세: 조건 표·출처·날짜 구분·길찾기 3종·전화
- [x] 공유 링크(`#/place/…`) 새 탭에서 열림
- [x] 홈 화면에 추가(iOS Safari 공유 → 홈 화면에 추가 / Android 설치) 후 실행
- [x] 비행기 모드: 앱 껍데기 + 마지막 데이터 표시(정보 기준일 확인)
- [x] 네이버지도 링크 실기기 동작(V-12)

## 5. 문제 대응

| 증상 | 원인 | 조치 |
|---|---|---|
| "카카오 지도 키가 없어…" | 빌드 때 `VITE_KAKAO_JS_KEY` 없음 | 시크릿 확인 후 다시 빌드·업로드 |
| "지도를 불러오지 못했어요" | 카카오 도메인 미등록·카카오맵 사용 OFF, 또는 배포별 미리보기 주소(`xxxxxxxx.<프로젝트 주소>`)로 접속 | 고정 주소로 접속. 그래도 같으면 카카오 콘솔 확인 |
| 지역 검색 "지금은 쓸 수 없어요" | 카카오 무료량 소진(429) 가능 | 다음 날 자동 복구. 통계에서 확인 |
| 가공 중 "[중단] 호출 상한" | 관광공사 실행당 800회 초과 | 다음 날 재실행(캐시 재사용) |
| 수정이 화면에 안 보임 | 서비스 워커 캐시 | 새로고침 두 번 또는 앱 다시 열기 |
| 배포를 되돌리기 | — | Cloudflare → Pages → paw-map → Deployments → 이전 배포 **Rollback** |
