// PAW MAP 서비스 워커(요구사항 NFR-10: 홈 화면 설치, 오프라인은 앱 껍데기 + 마지막으로 받은 데이터만)
// - 앱 화면(HTML·JS·CSS·아이콘): 캐시 우선. 빌드 파일 이름에 해시가 있어 새 배포는 새 파일로 받는다.
// - 데이터(/data/…): 네트워크 우선, 실패하면 마지막 캐시(화면에 "정보 기준일"이 함께 보임).
// - 카카오 지도·검색 등 다른 사이트 요청은 건드리지 않는다.
const VERSION = 'pawmap-v1'
const SHELL = `${VERSION}-shell`
const DATA = `${VERSION}-data`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(DATA).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    )
    return
  }

  // 화면 이동(주소창 새로고침 등)은 항상 index.html 로(해시 주소 #/place/… 포함)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html').then((hit) => hit || Response.error())))
    return
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()))
          return res
        }),
    ),
  )
})
