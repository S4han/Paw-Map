# PAW MAP

반려견과 함께 갈 수 있는 음식점·카페·숙소·관광지를 내 반려견 조건(몸무게·마릿수·실내 필수)으로 찾아주는 모바일 우선 PWA (가칭, 개발 중).

- 요구사항: [`docs/requirements.md`](docs/requirements.md)
- API 분석: [`docs/api-analysis.md`](docs/api-analysis.md)
- 아키텍처·화면 설계(STEP 3): [`docs/architecture.md`](docs/architecture.md)
- API 검증 스크립트: [`poc/`](poc/README.md)
- 개발 기록: [`docs/development-log.md`](docs/development-log.md)
- 작업 규칙: [`CLAUDE.md`](CLAUDE.md)

## 개발 환경 (GitHub Codespaces 권장)

저장소 → **Code → Codespaces → Create codespace**. 처음 만들 때 `.devcontainer/post-create.sh`가 프론트 의존성과 Python 가상환경을 설치합니다(수 분).

```bash
cd frontend
npm run dev      # 5173 포트가 자동으로 열림
npm test         # Vitest
npm run build    # 타입 검사 + 빌드

cd ../ingest
.venv/bin/pytest
.venv/bin/pawmap-ingest validate ../frontend/public/data/mock
```

- 지도: `frontend/.env.local`에 `VITE_KAKAO_JS_KEY=카카오 JavaScript 키`를 넣으면 지도가 보입니다(카카오 콘솔에 사이트 도메인 등록 필요). 없으면 목록 전용 모드로 동작합니다.
- 지금 화면의 장소는 모두 **가상(Mock) 데이터**입니다.

## 실제 데이터 만들기 (가공 파이프라인)

필요한 키(Codespaces 시크릿): `DATA_GO_KR_SERVICE_KEY`(관광공사 반려동물 동반여행 서비스 활용신청), `KAKAO_REST_API_KEY`(카카오 앱의 REST API 키 — 식약처 주소→좌표 변환).

```bash
# 식약처 '반려동물 동반 가능 업소 현황' xlsx 를 ingest/input/ 에 올린 뒤
cd ingest
.venv/bin/pawmap-ingest build --region 50 --out ../frontend/public/data/live \
  --mfds input/받은파일.xlsx --mfds-date 2026-10-13

# 화면에서 실제 데이터 보기
echo "VITE_DATASET_BASE=/data/live" >> ../frontend/.env.local   # 개발 서버 재시작
```

- 결과(`frontend/public/data/live/`), 캐시(`ingest/cache/`), 보고서(`reports/`)는 커밋하지 않습니다(식약처 재배포 조건 확인 전).
- 관광공사 상세는 수정일이 같으면 캐시를 재사용하고, 실행당 호출 상한(기본 800회)을 넘으면 멈춥니다.

## 배포·운영

[`docs/operations.md`](docs/operations.md) — 공개 범위 결정, Cloudflare Pages 직접 업로드, 정기 갱신, 점검표, 문제 대응.
