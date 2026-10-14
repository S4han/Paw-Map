import type { Category, PetPlace } from '../types/place'
import { distanceMeters, type LatLng } from './distance'

export type PetStatusFilter = 'ALLOWED_ONLY' | 'INCLUDE_UNKNOWN' | 'ALL'
// 공간: 출처가 "가능"이라고 한 곳만 남긴다(정보 없음은 빠짐 — 화면에 그렇게 안내)
export type SpaceFilter = 'ANY' | 'INDOOR' | 'OUTDOOR'
// 카테고리 탭: 하나만 고른다. '전체'는 동반 장소 4종(반려 생활 제외)
export type CategoryTab = 'ALL' | Category

const DOG_PLACES: Category[] = ['RESTAURANT', 'CAFE', 'STAY', 'ATTRACTION']

// 반려 생활 세부 종류로 거르기('ALL'이면 그대로). 다른 카테고리 장소는 건드리지 않는다
export function filterServiceType<T extends { place: Pick<PetPlace, 'category' | 'subcategory'> }>(items: T[], type: string): T[] {
  if (type === 'ALL') return items
  return items.filter(({ place }) => place.category !== 'PET_SERVICE' || place.subcategory === type)
}

export function categoriesForTab(tab: CategoryTab): ReadonlySet<Category> {
  return new Set(tab === 'ALL' ? DOG_PLACES : [tab])
}

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
  space: SpaceFilter = 'ANY',
): PlaceWithDistance[] {
  const statuses = allowedStatuses[status]
  const spaceOk = (p: PetPlace) =>
    space === 'ANY' || (space === 'INDOOR' ? p.petConditions.indoorAllowed === true : p.petConditions.outdoorAllowed === true)
  return places
    .filter((p) => categories.has(p.category) && statuses.includes(p.petStatus) && spaceOk(p))
    .map((place) => ({ place, distance: distanceMeters(center, { lat: place.latitude, lng: place.longitude }) }))
    .filter((x) => x.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
}
