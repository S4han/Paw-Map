import type { Category, PetPlace } from '../types/place'
import { distanceMeters, type LatLng } from './distance'

export type PetStatusFilter = 'ALLOWED_ONLY' | 'INCLUDE_UNKNOWN' | 'ALL'

export type PlaceWithDistance = { place: PetPlace; distance: number }

const allowedStatuses: Record<PetStatusFilter, PetPlace['petStatus'][]> = {
  ALLOWED_ONLY: ['ALLOWED'],
  INCLUDE_UNKNOWN: ['ALLOWED', 'UNKNOWN'],
  ALL: ['ALLOWED', 'UNKNOWN', 'NOT_ALLOWED'],
}

// 기준점 반경 안 + 카테고리 + 동반 상태로 거른 뒤 거리순 정렬(요구사항 §4, §6.4)
export function filterPlaces(
  places: PetPlace[],
  center: LatLng,
  radius: number,
  categories: ReadonlySet<Category>,
  status: PetStatusFilter,
): PlaceWithDistance[] {
  const statuses = allowedStatuses[status]
  return places
    .filter((p) => categories.has(p.category) && statuses.includes(p.petStatus))
    .map((place) => ({ place, distance: distanceMeters(center, { lat: place.latitude, lng: place.longitude }) }))
    .filter((x) => x.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
}
