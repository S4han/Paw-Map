import type { DatasetManifest } from '../types/place'
import type { LatLng } from './distance'

const M_PER_DEG_LAT = 111_320

// 기준점 반경 원이 걸치는 시도 파일 코드들(manifest 의 경계 상자와 원의 외접 사각형이 겹치는지로 판단, 아키텍처 §4.1)
export function regionsForCircle(manifest: DatasetManifest, center: LatLng, radiusM: number): string[] {
  const dLat = radiusM / M_PER_DEG_LAT
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const [cMinLat, cMinLng, cMaxLat, cMaxLng] = [center.lat - dLat, center.lng - dLng, center.lat + dLat, center.lng + dLng]
  return manifest.regions
    .filter(({ bbox: [minLat, minLng, maxLat, maxLng] }) => cMinLat <= maxLat && cMaxLat >= minLat && cMinLng <= maxLng && cMaxLng >= minLng)
    .map((r) => r.code)
}
