import { distanceMeters, type LatLng } from './distance'

// 지도를 사용자가 이만큼 움직였을 때만 "이 지역 검색" 버튼을 보인다(자동 재검색 없음, 요구사항 AC-04-3)
export function searchHereThreshold(radiusM: number): number {
  return Math.max(300, radiusM * 0.3)
}

export function shouldOfferSearchHere(baseline: LatLng, mapCenter: LatLng, radiusM: number): boolean {
  return distanceMeters(baseline, mapCenter) > searchHereThreshold(radiusM)
}
