import { describe, expect, it } from 'vitest'
import type { Category, PetConditions, PetPlace, PetStatus } from '../types/place'
import { buildCourse } from './course'
import { isFavorite, parseFavorites, toggleFavorite } from './favorites'
import { freshness, freshnessAdvice } from './freshness'
import { reportIssueUrl } from './links'

function place(id: string, category: Category, lat: number, lng: number, petStatus: PetStatus = 'ALLOWED', cond: Partial<PetConditions> = {}): PetPlace {
  return {
    id,
    name: id,
    category,
    latitude: lat,
    longitude: lng,
    petStatus,
    petConditions: { notes: [], fieldSources: {}, conflicts: [], ...cond },
    evidence: [],
    conflictingEvidence: false,
  }
}

describe('freshness: 출처 확인일 기준 신선도', () => {
  const now = new Date('2026-10-14T12:00:00+09:00')

  it('확인일이 없으면 오래됐다고 하지 않고 "정보 없음"', () => {
    expect(freshness({}, now)).toEqual({ level: 'NO_DATE', text: '확인일 정보 없음' })
    expect(freshness({ lastVerifiedAt: '잘못된 값' }, now).level).toBe('NO_DATE')
  })

  it('1년 미만 최근 / 1년 이상 / 2년 이상', () => {
    expect(freshness({ lastVerifiedAt: '2026-08-01' }, now)).toMatchObject({ level: 'RECENT', text: '확인 2026-08-01' })
    expect(freshness({ lastVerifiedAt: '2025-10-14' }, now)).toMatchObject({ level: 'AGING', text: '확인 2025-10-14 · 1년 넘은 정보' })
    expect(freshness({ lastVerifiedAt: '2025-10-16' }, now).level).toBe('RECENT')
    expect(freshness({ lastVerifiedAt: '2022-03-01T09:00:00+09:00' }, now)).toMatchObject({ level: 'STALE', text: '확인 2022-03-01 · 4년 넘은 정보' })
  })

  it('최근 정보에는 재확인 안내를 따로 띄우지 않는다', () => {
    expect(freshnessAdvice({ level: 'RECENT', text: '' })).toBeNull()
    expect(freshnessAdvice({ level: 'NO_DATE', text: '' })).toContain('언제 확인한 정보인지')
    expect(freshnessAdvice({ level: 'STALE', text: '' })).toContain('2년')
  })
})

describe('buildCourse: 동반 가능 장소로 가까운 순 코스', () => {
  const start = { lat: 33.5, lng: 126.5 }

  it('카테고리 순서대로 가장 가까운 다음 장소를 고르고, 미확인·불가는 넣지 않는다', () => {
    const places = [
      place('관광-먼', 'ATTRACTION', 33.52, 126.5),
      place('관광-가까운', 'ATTRACTION', 33.501, 126.5),
      place('식당-미확인', 'RESTAURANT', 33.5011, 126.5, 'UNKNOWN'),
      place('식당-불가', 'RESTAURANT', 33.5012, 126.5, 'NOT_ALLOWED'),
      place('식당', 'RESTAURANT', 33.505, 126.5),
      place('카페', 'CAFE', 33.506, 126.5),
    ]
    const course = buildCourse(places, start, {})
    expect(course.stops.map((s) => s.place.id)).toEqual(['관광-가까운', '식당', '카페'])
    expect(course.missing).toEqual([])
    expect(Math.round(course.totalMeters / 100)).toBe(7) // 약 0.67km
  })

  it('반려견 조건이 있으면 조건 불일치는 빼고, 확인 필요는 표시와 함께 넣는다', () => {
    const places = [
      place('관광-10kg', 'ATTRACTION', 33.5005, 126.5, 'ALLOWED', { maxWeightKg: 10 }),
      place('관광-정보없음', 'ATTRACTION', 33.502, 126.5),
    ]
    const course = buildCourse(places, start, { weightKg: 12 }, ['ATTRACTION'])
    expect(course.stops).toHaveLength(1)
    expect(course.stops[0].place.id).toBe('관광-정보없음')
    expect(course.stops[0].match?.status).toBe('NEEDS_CONFIRMATION')
  })

  it('멀거나 없는 카테고리는 건너뛰고 알려 준다', () => {
    const places = [place('관광', 'ATTRACTION', 33.501, 126.5), place('먼카페', 'CAFE', 33.7, 126.5)]
    const course = buildCourse(places, start, {})
    expect(course.stops.map((s) => s.place.id)).toEqual(['관광'])
    expect(course.missing).toEqual(['RESTAURANT', 'CAFE'])
  })
})

describe('favorites: 이 기기에 저장', () => {
  const p = { id: 'kto:1', name: '카페', category: 'CAFE' as const }

  it('누르면 저장, 다시 누르면 해제(최근 저장이 앞)', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    const one = toggleFavorite([], p, now)
    expect(one).toEqual([{ ...p, savedAt: '2026-10-14T00:00:00.000Z' }])
    const two = toggleFavorite(one, { id: 'kto:2', name: '식당', category: 'RESTAURANT' }, now)
    expect(two.map((s) => s.id)).toEqual(['kto:2', 'kto:1'])
    expect(isFavorite(toggleFavorite(two, p), 'kto:1')).toBe(false)
  })

  it('저장된 값이 깨졌거나 모양이 다르면 버린다', () => {
    expect(parseFavorites(null)).toEqual([])
    expect(parseFavorites('{')).toEqual([])
    expect(parseFavorites('{"id":"x"}')).toEqual([])
    const ok = { id: 'a', name: 'A', category: 'CAFE', savedAt: '2026-10-14' }
    expect(parseFavorites(JSON.stringify([ok, { id: 'b', name: 'B', category: 'BAR', savedAt: 'x' }, null]))).toEqual([ok])
  })
})

describe('reportIssueUrl: 정보 수정 제보 링크', () => {
  it('장소 정보를 채운 GitHub 이슈 작성 주소를 만들고 위치·조건은 넣지 않는다', () => {
    const url = reportIssueUrl('https://github.com/o/r/issues/new', { id: 'mfds:12', name: '나무 & 풀', address: '제주시 1' })
    expect(url.startsWith('https://github.com/o/r/issues/new?title=')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('[정보 제보] 나무 & 풀')
    expect(params.get('body')).toContain('장소 ID: mfds:12')
    expect(params.get('body')).toContain('주소: 제주시 1')
    expect(params.get('body')).not.toMatch(/33\.|126\./) // 좌표 없음
  })
})
