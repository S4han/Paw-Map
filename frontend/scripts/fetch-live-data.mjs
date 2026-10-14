// 자동 배포(GitHub Actions)용: 지금 운영 중인 사이트에서 실데이터를 받아 public/data/live 에 둔다.
// 실데이터는 저장소에 커밋하지 않으므로(CLAUDE.md 보안) 코드만 바뀐 배포는 운영 데이터를 그대로 이어 쓴다.
// 데이터 갱신은 지금처럼 Codespaces 에서 가공 → 수동 배포(docs/operations.md §2.2).
// 사용: LIVE_DATA_URL=https://<운영 주소>/data/live node scripts/fetch-live-data.mjs (Actions 에서는 Cloudflare 에서 주소를 읽어 넘긴다)
import { mkdirSync, writeFileSync } from 'node:fs'

if (!process.env.LIVE_DATA_URL) throw new Error('LIVE_DATA_URL 이 필요합니다')
const base = process.env.LIVE_DATA_URL.replace(/\/$/, '')
const out = new URL('../public/data/live/', import.meta.url).pathname

async function get(name) {
  const res = await fetch(`${base}/${name}`, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const text = await res.text()
  try {
    JSON.parse(text)
  } catch {
    // 없는 파일이면 Pages 가 첫 화면(HTML)을 200 으로 돌려준다
    throw new Error(`${base}/${name} 이 JSON 이 아닙니다(앞부분: ${text.slice(0, 40).replace(/\s+/g, ' ')}) — 이 주소에 실데이터가 배포되어 있는지 확인하세요`)
  }
  return text
}

const manifestText = await get('manifest.json')
const manifest = JSON.parse(manifestText)
if (manifest.isMock) throw new Error('운영 사이트의 데이터가 가상 데이터입니다 — 배포 중단')

mkdirSync(out, { recursive: true })
writeFileSync(out + 'manifest.json', manifestText)
for (const region of manifest.regions) {
  const files = [[region.file, region.count], ...(region.servicesFile ? [[region.servicesFile, region.servicesCount]] : [])]
  for (const [file, count] of files) {
    if (!/^[\w.-]+\.json$/.test(file)) throw new Error(`이상한 파일 이름: ${file}`)
    writeFileSync(out + file, await get(file))
    console.log(`✓ ${file} (${count}곳)`)
  }
}
console.log(`실데이터 받음: ${base} · 생성 ${manifest.generatedAt}`)
