# PAW MAP — 작업 규칙

반려견 동반 장소(음식점·카페·숙소·관광지)를 내 반려견 조건으로 찾는 모바일 우선 PWA.
기준 문서: `docs/requirements.md`(요구사항), `docs/api-analysis.md`(데이터 출처 실측), `docs/architecture.md`(구조).

## 진행 방식

- STEP 단위로 작업하고, 단계마다 사용자 승인 후 다음 단계로 간다. 단계 보고 형식은 마스터 지침 §8.
- 검증하지 않은 API 사양·요금·약관을 사실로 쓰지 않는다. 문서에는 실측(✅)·검색 요약(🔷)·커뮤니티(⚠️)·미확인(❓)을 구분한다.
- 파일 삭제, 배포, 유료 리소스 생성, 외부 서비스에 쓰기는 사전 승인. 배포 절차는 `docs/operations.md`.

## 데이터 원칙 (가장 중요)

- 값이 없는 조건(`undefined`/`None`)은 "확인 안 됨"이다. `true`/`false`로 바꾸지 않는다. 유일한 예외는 Q-2(1마리 + 동반 가능).
- 출처끼리 다르면 자동으로 고르지 않는다(`UNKNOWN` + 충돌 표시).
- 식약처 목록에 없다는 것은 동반 불가 근거가 아니다.
- `checkedAt`(출처가 준 확인일)과 `fetchedAt`(우리가 받은 시각)을 섞지 않는다.

## 구조

- `frontend/`: React 19 + TS + Vite + Tailwind 4. 순수 로직은 `src/domain/`(Vitest).
- `ingest/`: Python 가공 파이프라인 + Pydantic 모델(pytest). `models.py`와 `frontend/src/types/place.ts`는 항상 같이 고친다.
- 런타임 서버 없음(안 A): 가공된 시도별 JSON을 정적 파일로 배포, 브라우저가 거리·필터·매칭 계산.
- `poc/`: STEP 2 검증 스크립트(보존용).

## 명령

```bash
cd frontend && npm run dev        # 개발 서버
cd frontend && npm test           # Vitest
cd frontend && npm run build      # 타입 검사 + 빌드
cd frontend && npm run check:secrets   # 빌드 결과에 서버 키가 없는지
cd frontend && npm run e2e        # Playwright 주요 흐름(처음 한 번 npx playwright install chromium)
cd ingest && .venv/bin/pytest     # 가공 파이프라인 테스트
cd ingest && .venv/bin/pawmap-ingest validate ../frontend/public/data/mock   # 데이터셋 검증(격자 방식)
cd ingest && .venv/bin/pawmap-ingest tile ../frontend/mock-src ../frontend/public/data/mock   # 가상 데이터 원본 → 격자 칸
cd ingest && .venv/bin/pawmap-ingest build --region all --out ../frontend/public/data/live --mfds input/파일.xlsx --mfds-date YYYY-MM-DD --kcisa input/파일.csv --kcisa-date YYYY-MM-DD
```

## 보안

- 공개 저장소다. 키·`.env*`·원본 데이터 파일(`ingest/input/`)·가공 캐시(`ingest/cache/`)·실데이터(`frontend/public/data/live/`)·가공 보고서(`reports/`)·`poc/out/`은 커밋하지 않는다.
- 브라우저에 들어가는 키는 카카오 JavaScript 키(도메인 제한)뿐. REST 키·공공데이터 키는 가공 환경에만.
