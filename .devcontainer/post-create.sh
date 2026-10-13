#!/usr/bin/env bash
# 코드스페이스를 처음 만들 때 한 번 실행: 프론트 의존성 + 가공 파이프라인 가상환경
set -euo pipefail

(cd frontend && npm install --no-audit --no-fund)

python -m venv ingest/.venv
ingest/.venv/bin/pip install -q -e 'ingest[dev]'

echo "준비 완료: 'cd frontend && npm run dev' 로 개발 서버를 실행하세요."
