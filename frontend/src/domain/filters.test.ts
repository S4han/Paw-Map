import { describe, expect, it } from 'vitest'
import type { Category, PetPlace, PetStatus } from '../types/place'
import { filterPlaces } from './filters'

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
})
