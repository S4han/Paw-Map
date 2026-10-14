import type { LatLng } from '../domain/distance'

// 상세 화면 주소: #/place/{id}@{위도},{경도}. 해시를 쓰면 정적 호스팅에서도 새로고침·공유·뒤로가기가 동작한다(서버 없음, 안 A).
// 좌표는 격자 방식에서 공유 링크를 연 사람의 반경 밖 장소도 그 칸 파일을 받아 열 수 있게 붙인다(예전 링크는 좌표 없이도 동작).
const PREFIX = '#/place/'

export type PlaceRoute = { id: string; at?: LatLng }

export function parsePlaceHash(hash: string): PlaceRoute | null {
  if (!hash.startsWith(PREFIX)) return null
  const raw = decodeURIComponent(hash.slice(PREFIX.length))
  const m = raw.match(/^(.*)@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
  if (!m) return raw ? { id: raw } : null
  return { id: m[1], at: { lat: Number(m[2]), lng: Number(m[3]) } }
}

export function placeHash(id: string, at?: LatLng): string {
  return `${PREFIX}${encodeURIComponent(at ? `${id}@${at.lat.toFixed(5)},${at.lng.toFixed(5)}` : id)}`
}
