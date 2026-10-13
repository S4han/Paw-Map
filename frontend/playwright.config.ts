import { defineConfig, devices } from '@playwright/test'

// 주요 사용자 흐름 E2E(마스터 지침 STEP 9). 결과가 늘 같도록 가상 데이터 + 지도 키 없음(목록 모드)으로 실행한다.
// 실행: npx playwright install chromium (처음 한 번) → npm run e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4173', locale: 'ko-KR' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    timeout: 120_000,
    reuseExistingServer: false,
    // 실행 환경 변수가 .env.local 보다 우선한다(Vite 규칙)
    env: { VITE_KAKAO_JS_KEY: '', VITE_DATASET_BASE: '/data/mock' },
  },
})
