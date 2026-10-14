import type { DatasetManifest } from '../types/place'
import type { LatLng } from './distance'

// 격자 칸(가공 파이프라인 ingest/pawmap_ingest/tiles.py 와 같은 규칙): "{floor(위도×f)}_{floor(경도×f)}", f = 1/칸크기
const M_PER_DEG_LAT = 111_320

function factor(deg: number): number {
  return Math.round(1 / deg)
}

export function tileKey(lat: number, lng: number, deg: number): string {
  const f = factor(deg)
  return `${Math.floor(lat * f + 1e-9)}_${Math.floor(lng * f + 1e-9)}`
}

// 기준점 반경 원의 외접 사각형이 걸치는 칸 중 데이터가 있는 칸
export function tilesForCircle(manifest: DatasetManifest, center: LatLng, radiusM: number): string[] {
  if (!manifest.tiles || !manifest.tileDeg) return []
  const f = factor(manifest.tileDeg)
  const dLat = radiusM / M_PER_DEG_LAT
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const [i0, i1] = [Math.floor((center.lat - dLat) * f), Math.floor((center.lat + dLat) * f)]
  const [j0, j1] = [Math.floor((center.lng - dLng) * f), Math.floor((center.lng + dLng) * f)]
  const have = new Set(manifest.tiles.map((t) => t.key))
  const keys: string[] = []
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (have.has(`${i}_${j}`)) keys.push(`${i}_${j}`)
  return keys
}
