// 배포 전 검사: 빌드 결과(dist)에 서버 전용 키가 들어가지 않았는지 확인한다(요구사항 NFR-03, 아키텍처 §10).
// 브라우저에 들어가도 되는 키는 카카오 JavaScript 키(도메인 제한)뿐이다.
// 사용: npm run build && npm run check:secrets
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SERVER_ONLY = ['DATA_GO_KR_SERVICE_KEY', 'KAKAO_REST_API_KEY', 'GOOGLE_PLACES_API_KEY']
const dist = new URL('../dist/', import.meta.url).pathname

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

const secrets = SERVER_ONLY.map((name) => [name, (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '')]).filter(([, v]) => v.length >= 8)
if (secrets.length === 0) {
  console.log('⚠ 검사할 서버 키가 환경변수에 없습니다(이 환경에 키가 없다면 정상). 키 이름만 검사합니다.')
}

let problems = 0
for (const file of files(dist)) {
  const text = readFileSync(file, 'utf-8')
  for (const [name, value] of secrets) {
    if (text.includes(value) || text.includes(encodeURIComponent(value))) {
      console.error(`✗ ${name} 값이 ${file} 에 들어 있습니다`)
      problems++
    }
  }
  for (const name of SERVER_ONLY) {
    if (text.includes(name)) {
      console.error(`✗ 서버 키 이름 ${name} 이 ${file} 에 들어 있습니다(코드에서 참조하는지 확인)`)
      problems++
    }
  }
}
if (problems) process.exit(1)
console.log(`✓ dist 안에 서버 전용 키 없음 (검사한 키 값 ${secrets.length}개)`)
