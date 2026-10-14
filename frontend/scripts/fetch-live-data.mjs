// 자동 배포(GitHub Actions)용: 지금 운영 중인 사이트에서 실데이터를 받아 public/data/live 에 둔다.
// 실데이터는 저장소에 커밋하지 않으므로(CLAUDE.md 보안) 코드만 바뀐 배포는 운영 데이터를 그대로 이어 쓴다.
// 데이터 갱신은 지금처럼 Codespaces 에서 가공 → 수동 배포(docs/operations.md §2.2).
// 사용: LIVE_DATA_URL=https://paw-map.pages.dev/data/live node scripts/fetch-live-data.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const base = (process.env.LIVE_DATA_URL || 'https://paw-map.pages.dev/data/live').replace(/\/$/, '')
const out = new URL('../public/data/live/', import.meta.url).pathname

async function get(name) {
  const res = await fetch(`${base}/${name}`, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const text = await res.text()
  JSON.parse(text) // HTML 오류 페이지 등이 오면 여기서 멈춘다
  return text
}

const manifestText = await get('manifest.json')
const manifest = JSON.parse(manifestText)
if (manifest.isMock) throw new Error('운영 사이트의 데이터가 가상 데이터입니다 — 배포 중단')

mkdirSync(out, { recursive: true })
writeFileSync(out + 'manifest.json', manifestText)
for (const region of manifest.regions) {
  if (!/^[\w.-]+\.json$/.test(region.file)) throw new Error(`이상한 파일 이름: ${region.file}`)
  writeFileSync(out + region.file, await get(region.file))
  console.log(`✓ ${region.file} (${region.count}곳)`)
}
console.log(`실데이터 받음: ${base} · 생성 ${manifest.generatedAt}`)
