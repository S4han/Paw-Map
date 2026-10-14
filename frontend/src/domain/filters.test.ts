import { describe, expect, it } from 'vitest'
import type { Category, PetPlace, PetStatus } from '../types/place'
import { categoriesForTab, filterPlaces, filterServiceType } from './filters'

const center = { lat: 33.4996, lng: 126.5312 }
const all = new Set<Category>(['RESTAURANT', 'CAFE', 'STAY', 'ATTRACTION'])

function place(id: string, latOffset: number, category: Category = 'CAFE', petStatus: PetStatus = 'ALLOWED'): PetPlace {
  return {
    id,
    name: id,
    category,
    latitude: center.lat + latOffset,
    longitude: center.lng,
    petStatus,
    petConditions: { notes: [], fieldSources: {}, conflicts: [] },
    evidence: [],
    conflictingEvidence: false,
  }
}

describe('filterPlaces', () => {
  // 위도 0.01도 ≈ 1.11km
  const places = [place('far', 0.05), place('near', 0.001), place('mid', 0.02)]

  it('반경 밖은 제외하고 거리순으로 정렬', () => {
    const r = filterPlaces(places, center, 3000, all, 'ALLOWED_ONLY')
    expect(r.map((x) => x.place.id)).toEqual(['near', 'mid'])
  })

  it('카테고리 필터', () => {
    const r = filterPlaces([place('a', 0, 'STAY'), place('b', 0, 'CAFE')], center, 1000, new Set(['STAY']), 'ALL')
    expect(r.map((x) => x.place.id)).toEqual(['a'])
  })

  it('기본 "동반 가능만"은 미확인·불가를 숨기고, "미확인 포함"은 불가만 숨긴다', () => {
    const ps = [place('ok', 0), place('unk', 0, 'CAFE', 'UNKNOWN'), place('no', 0, 'CAFE', 'NOT_ALLOWED')]
    expect(filterPlaces(ps, center, 1000, all, 'ALLOWED_ONLY').map((x) => x.place.id)).toEqual(['ok'])
    expect(filterPlaces(ps, center, 1000, all, 'INCLUDE_UNKNOWN').map((x) => x.place.id).sort()).toEqual(['ok', 'unk'])
    expect(filterPlaces(ps, center, 1000, all, 'ALL')).toHaveLength(3)
  })

  it('반려 생활은 "동반 가능만"에서도 동반 정보 없는 시설(인허가 동물병원)을 보이고, 불가라고 한 곳은 뺀다', () => {
    const svc = new Set<Category>(['PET_SERVICE'])
    const ps = [place('ok', 0, 'PET_SERVICE'), place('vet', 0, 'PET_SERVICE', 'UNKNOWN'), place('no', 0, 'PET_SERVICE', 'NOT_ALLOWED')]
    expect(filterPlaces(ps, center, 1000, svc, 'ALLOWED_ONLY').map((x) => x.place.id).sort()).toEqual(['ok', 'vet'])
    expect(filterPlaces(ps, center, 1000, svc, 'ALL')).toHaveLength(3)
  })
})

describe('카테고리 탭·공간 필터', () => {
  it("'전체'는 동반 장소 4종(반려 생활 제외), 그 밖은 한 종류", () => {
    expect([...categoriesForTab('ALL')].sort()).toEqual(['ATTRACTION', 'CAFE', 'RESTAURANT', 'STAY'])
    expect([...categoriesForTab('PET_SERVICE')]).toEqual(['PET_SERVICE'])
  })

  it('실내/실외 필터는 출처가 "가능"이라고 한 곳만 남긴다(정보 없음 제외)', () => {
    const at = (indoorAllowed?: boolean, outdoorAllowed?: boolean): PetPlace => {
      const p = place(`${indoorAllowed}-${outdoorAllowed}`, 0)
      return { ...p, petConditions: { ...p.petConditions, indoorAllowed, outdoorAllowed } }
    }
    const places = [at(true, undefined), at(false, true), at(undefined, undefined)]
    const ids = (space: 'ANY' | 'INDOOR' | 'OUTDOOR') =>
      filterPlaces(places, center, 1000, categoriesForTab('ALL'), 'ALL', space).map((x) => x.place.id)
    expect(ids('ANY')).toHaveLength(3)
    expect(ids('INDOOR')).toEqual(['true-undefined'])
    expect(ids('OUTDOOR')).toEqual(['false-true'])
  })
})

describe('반려 생활 세부 종류', () => {
  it('고른 종류의 반려 생활만 남기고 다른 카테고리는 그대로', () => {
    const item = (id: string, category: Category, subcategory?: string) => ({ place: { ...place(id, 0, category), subcategory } })
    const items = [item('병원', 'PET_SERVICE', '동물병원'), item('미용', 'PET_SERVICE', '미용'), item('카페', 'CAFE')]
    expect(filterServiceType(items, 'ALL')).toHaveLength(3)
    expect(filterServiceType(items, '동물병원').map((x) => x.place.id)).toEqual(['병원', '카페'])
  })
})
