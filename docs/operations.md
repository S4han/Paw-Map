# PAW MAP — 배포·운영 안내 (STEP 9)

- 작성일: 2026-10-13
- 구조: 서버 없음(안 A). 가공된 시도별 JSON + 프론트 빌드 결과를 **Cloudflare Pages에 정적 파일로 직접 업로드**한다.
- 표기: 🔷 문서·검색 확인, ❓ 미확인 — 요금·한도는 각 콘솔에서 다시 확인한다.

---

## 1. 공개 범위 결정 (D-8, 배포 전 필수)

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
4. 카카오 콘솔 → 앱 → 플랫폼 키 → JavaScript SDK 도메인에 `https://paw-map.pages.dev` 추가.
5. (안 C) Cloudflare Zero Trust → Access → Applications → Self-hosted → 도메인 `paw-map.pages.dev`, 정책: 본인 이메일만 Allow.

### 2.2 배포 명령

```bash
cd /workspaces/Paw-Map

# 1) 데이터 가공(안 B면 --mfds 두 인자를 뺀다)
cd ingest && .venv/bin/pawmap-ingest build --region 50 --out ../frontend/public/data/live \
  --mfds input/dogs_info.xlsx --mfds-date YYYY-MM-DD && cd ..

# 2) 검사 → 빌드 → 키 노출 검사
cd frontend
npm test
VITE_DATASET_BASE=/data/live npm run build
npm run check:secrets

# 3) 업로드(Direct Upload)
npx wrangler pages deploy dist --project-name paw-map --branch main
```

- `public/data/live/`는 커밋하지 않지만 빌드 결과(`dist/`)에는 들어가 업로드된다 → **공개 범위(§1)를 정한 뒤에만** 실행한다.
- 업로드 후 출력되는 주소로 접속해 §4 점검표를 확인한다.

---

## 3. 정기 운영

| 주기 | 작업 | 방법 |
|---|---|---|
| 월 1회(권장) | 데이터 갱신 | 식품안전나라에서 xlsx 새로 받기 → §2.2 전체 실행. 관광공사 상세는 수정일이 같으면 캐시 재사용 |
| 갱신 때마다 | 가공 보고서 확인 | `reports/ingest-*.md`: 좌표 변환 실패, 병합·검토 후보, 파싱 경고, 카테고리 분포 |
| 월 1회 | 무료 사용량 확인 | 카카오 콘솔 → 통계 → 쿼터(지도·로컬). 공공데이터포털 → 마이페이지 → 활용 현황. Cloudflare → Pages 프로젝트 분석 |
| 수시 | 오류 신고·정보 변경 | P1 제보 기능 전까지는 저장소 Issues 로 받고 다음 갱신 때 반영 |

### 무료 운영 장치

- 런타임 서버 없음 → 사용자 요청마다 호출되는 유료 API 없음.
- 카카오: 무료량 초과 시 **429 오류로 멈춤(과금 아님)** — 비즈월렛·유료 설정을 하지 않는다(🔷 카카오 공지 2026-07-21).
- 관광공사: 가공 1회 약 60회 호출(일 1,000건 한도 보고값 ⚠️).
- Google: 사용 안 함(D-4). PoC 전용 키는 삭제.
- Cloudflare Pages 정적 호스팅 무료 범위 ❓ — 대시보드 요금제 화면에서 확인.

## 4. 배포 후 점검표

- [ ] 첫 화면: 노란 "가상 데이터" 띠가 **없고**, 하단에 "자료: 한국관광공사(…), 식약처(…)"
- [ ] 지도 표시(카카오 도메인 등록 확인), 내 위치 버튼 권한 요청
- [ ] 지역 검색 후보 표시
- [ ] 조건 설정 → 매칭 배지·필터
- [ ] 상세: 조건 표·출처·날짜 구분·길찾기 3종·전화
- [ ] 공유 링크(`#/place/…`) 새 탭에서 열림
- [ ] 홈 화면에 추가(iOS Safari 공유 → 홈 화면에 추가 / Android 설치) 후 실행
- [ ] 비행기 모드: 앱 껍데기 + 마지막 데이터 표시(정보 기준일 확인)
- [ ] 네이버지도 링크 실기기 동작(V-12)

## 5. 문제 대응

| 증상 | 원인 | 조치 |
|---|---|---|
| "카카오 지도 키가 없어…" | 빌드 때 `VITE_KAKAO_JS_KEY` 없음 | 시크릿 확인 후 다시 빌드·업로드 |
| "지도를 불러오지 못했어요" | 카카오 도메인 미등록·카카오맵 사용 OFF | 카카오 콘솔 확인 |
| 지역 검색 "지금은 쓸 수 없어요" | 카카오 무료량 소진(429) 가능 | 다음 날 자동 복구. 통계에서 확인 |
| 가공 중 "[중단] 호출 상한" | 관광공사 실행당 800회 초과 | 다음 날 재실행(캐시 재사용) |
| 수정이 화면에 안 보임 | 서비스 워커 캐시 | 새로고침 두 번 또는 앱 다시 열기 |
| 배포를 되돌리기 | — | Cloudflare → Pages → paw-map → Deployments → 이전 배포 **Rollback** |
