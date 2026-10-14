import type { Category, PetPlace, PetProfile } from '../types/place'
import { distanceMeters, type LatLng } from './distance'
import { matchPlace, type MatchResult } from './match'

// 반려견 여행 코스(요구사항 P2). 기준점에서 시작해 카테고리 순서대로 "가장 가까운 다음 장소"를 고른다.
// - 동반 가능(ALLOWED)으로 판정된 장소만 쓴다. 미확인·불가는 코스에 넣지 않는다.
// - 반려견 조건이 있으면 "조건 불일치"는 빼고, "확인 필요"는 넣되 표시한다(숨기면 고를 곳이 거의 없어짐).
// - 거리는 직선거리다. 실제 이동 경로·영업시간·휴무는 반영하지 않는다(화면에 안내).
export type CourseStop = { place: PetPlace; legMeters: number; match: MatchResult | null }
export type Course = { stops: CourseStop[]; missing: Category[]; totalMeters: number }

export const DEFAULT_COURSE_ORDER: Category[] = ['ATTRACTION', 'RESTAURANT', 'CAFE']
export const MAX_LEG_METERS = 10_000 // 다음 장소가 이보다 멀면 그 카테고리는 건너뛴다

export function buildCourse(
  places: PetPlace[],
  start: LatLng,
  profile: PetProfile,
  order: Category[] = DEFAULT_COURSE_ORDER,
  maxLegMeters: number = MAX_LEG_METERS,
): Course {
  const used = new Set<string>()
  const stops: CourseStop[] = []
  const missing: Category[] = []
  let here = start

  for (const category of order) {
    let best: CourseStop | null = null
    for (const place of places) {
      if (place.category !== category || place.petStatus !== 'ALLOWED' || used.has(place.id)) continue
      const match = matchPlace(place, profile)
      if (match?.status === 'MISMATCH') continue
      const legMeters = distanceMeters(here, { lat: place.latitude, lng: place.longitude })
      if (legMeters > maxLegMeters) continue
      // 같은 거리면 확인 필요보다 조건 적합을 먼저
      const better =
        !best || legMeters < best.legMeters || (legMeters === best.legMeters && match?.status === 'MATCH' && best.match?.status !== 'MATCH')
      if (better) best = { place, legMeters, match }
    }
    if (!best) {
      missing.push(category)
      continue
    }
    stops.push(best)
    used.add(best.place.id)
    here = { lat: best.place.latitude, lng: best.place.longitude }
  }

  return { stops, missing, totalMeters: stops.reduce((sum, s) => sum + s.legMeters, 0) }
}
