#!/usr/bin/env bash
# 코드스페이스를 처음 만들 때 한 번 실행: 프론트 의존성 + 가공 파이프라인 가상환경 + E2E 브라우저
set -euo pipefail

(cd frontend && npm install --no-audit --no-fund)

python -m venv ingest/.venv
ingest/.venv/bin/pip install -q -e 'ingest[dev]'

# 기본 이미지의 Yarn apt 저장소는 서명 키가 없어 apt 갱신을 막는다(2026-10-13 확인).
# 이 프로젝트는 Yarn 을 쓰지 않으므로 끄고, Playwright 브라우저와 시스템 라이브러리를 설치한다.
sudo rm -f /etc/apt/sources.list.d/yarn*
sudo sed -i '/yarnpkg/s/^/# /' /etc/apt/sources.list 2>/dev/null || true
(cd frontend && npx playwright install --with-deps chromium) || echo "⚠ Playwright 브라우저 설치 실패 — E2E 전에 'npx playwright install --with-deps chromium' 을 다시 실행하세요"

echo "준비 완료: 'cd frontend && npm run dev' 로 개발 서버를 실행하세요."
