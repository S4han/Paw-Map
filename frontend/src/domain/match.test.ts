import { describe, expect, it } from 'vitest'
import type { PetConditions, PetPlace, PetProfile, PetStatus } from '../types/place'
import { isProfileSet, matchPlace } from './match'

function place(petStatus: PetStatus, cond: Partial<PetConditions> = {}, conflictingEvidence = false): PetPlace {
  return {
    id: 'x',
    name: 'x',
    category: 'CAFE',
    latitude: 33.5,
    longitude: 126.5,
    petStatus,
    petConditions: { notes: [], fieldSources: {}, conflicts: [], ...cond },
    evidence: [],
    conflictingEvidence,
  }
}

const status = (p: PetPlace, profile: PetProfile) => matchPlace(p, profile)?.status

describe('반려 생활 시설', () => {
  it('병원·약국 등은 반려견 조건 매칭 대상이 아니다', () => {
    expect(matchPlace({ ...place('ALLOWED'), category: 'PET_SERVICE' }, { weightKg: 12 })).toBeNull()
  })
})
const messages = (p: PetPlace, profile: PetProfile) => matchPlace(p, profile)?.reasons.filter((r) => r.result !== 'OK').map((r) => r.message)

describe('요구사항 §6.3 예시 표 (프로필: 12kg · 2마리 · 실내 필수)', () => {
  const profile: PetProfile = { weightKg: 12, dogCount: 2, indoorRequired: true }

  it('동반 가능, 최대 15kg, 최대 2마리, 실내 가능 → 적합', () => {
    expect(status(place('ALLOWED', { maxWeightKg: 15, maxDogs: 2, indoorAllowed: true }), profile)).toBe('MATCH')
  })
  it('동반 가능, 10kg 이하 → 불일치(몸무게)', () => {
    const p = place('ALLOWED', { maxWeightKg: 10 })
    expect(status(p, profile)).toBe('MISMATCH')
    expect(messages(p, profile)![0]).toBe('몸무게 제한 10kg 이하')
  })
  it('동반 가능, 실외만 → 불일치(실내)', () => {
    const p = place('ALLOWED', { indoorAllowed: false, maxWeightKg: 15, maxDogs: 2 })
    expect(status(p, profile)).toBe('MISMATCH')
    expect(messages(p, profile)).toEqual(['실내 동반 불가'])
  })
  it('동반 가능, 소형견만(kg 없음) → 확인 필요', () => {
    const p = place('ALLOWED', { notes: ['소형견만 가능'], maxDogs: 2, indoorAllowed: true })
    expect(status(p, profile)).toBe('NEEDS_CONFIRMATION')
    expect(messages(p, profile)).toEqual(['몸무게 기준(kg) 정보 없음'])
  })
  it('동반 가능, 그 외 정보 없음 → 확인 필요(세 가지 모두 정보 없음)', () => {
    const p = place('ALLOWED')
    expect(status(p, profile)).toBe('NEEDS_CONFIRMATION')
    expect(messages(p, profile)).toEqual(['몸무게 기준(kg) 정보 없음', '최대 마릿수 정보 없음', '실내 동반 정보 없음'])
  })
  it('출처 간 충돌 → 확인 필요', () => {
    expect(matchPlace(place('UNKNOWN', {}, true), profile)).toEqual({
      status: 'NEEDS_CONFIRMATION',
      reasons: [{ field: 'petStatus', result: 'CONFLICT', message: '출처 간 정보 충돌' }],
    })
  })
  it('동반 불가 → 불일치', () => {
    expect(messages(place('NOT_ALLOWED', { maxWeightKg: 30, indoorAllowed: true }), profile)).toEqual(['반려견 동반 불가'])
  })
})

describe('경계값·특수 규칙', () => {
  it('"이하"는 같은 값 허용, "미만"은 같은 값 불허', () => {
    expect(status(place('ALLOWED', { maxWeightKg: 5 }), { weightKg: 5 })).toBe('MATCH')
    expect(status(place('ALLOWED', { maxWeightKg: 5, maxWeightExclusive: true }), { weightKg: 5 })).toBe('MISMATCH')
    expect(status(place('ALLOWED', { maxWeightKg: 5, maxWeightExclusive: true }), { weightKg: 4.9 })).toBe('MATCH')
  })

  it('"전 견종"은 몸무게 충족(D-7)', () => {
    expect(status(place('ALLOWED', { noWeightLimit: true }), { weightKg: 40 })).toBe('MATCH')
  })

  it('Q-2: 1마리는 동반 가능만으로 충족, 2마리는 최대 마릿수가 있어야 함', () => {
    expect(status(place('ALLOWED'), { dogCount: 1 })).toBe('MATCH')
    expect(status(place('ALLOWED'), { dogCount: 2 })).toBe('NEEDS_CONFIRMATION')
    expect(status(place('ALLOWED', { maxDogs: 1 }), { dogCount: 2 })).toBe('MISMATCH')
    expect(status(place('ALLOWED', { maxDogs: 3 }), { dogCount: 3 })).toBe('MATCH')
  })

  it('Q-2 예외는 동반 미확인 장소에는 적용되지 않는다', () => {
    expect(status(place('UNKNOWN'), { dogCount: 1 })).toBe('NEEDS_CONFIRMATION')
  })

  it('조건 필드 충돌은 확인 필요', () => {
    const p = place('ALLOWED', { conflicts: ['maxWeightKg'] })
    expect(status(p, { weightKg: 3 })).toBe('NEEDS_CONFIRMATION')
    expect(messages(p, { weightKg: 3 })).toEqual(['몸무게 기준이 출처마다 달라요'])
    expect(status(place('ALLOWED', { conflicts: ['indoorAllowed'] }), { indoorRequired: true })).toBe('NEEDS_CONFIRMATION')
  })

  it('입력한 항목만 평가한다', () => {
    // 실내 정보가 없어도 실내 필수를 켜지 않았으면 영향 없음
    expect(status(place('ALLOWED', { maxWeightKg: 10 }), { weightKg: 8 })).toBe('MATCH')
  })

  it('불일치가 하나라도 있으면 정보 없음보다 우선', () => {
    expect(status(place('ALLOWED', { maxWeightKg: 5 }), { weightKg: 12, dogCount: 2 })).toBe('MISMATCH')
  })

  it('사유는 불일치 → 충돌 → 정보 없음 → 충족 순', () => {
    const r = matchPlace(place('ALLOWED', { maxWeightKg: 5, indoorAllowed: true, conflicts: ['maxDogs'] }), { weightKg: 12, dogCount: 2, indoorRequired: true })!
    expect(r.reasons.map((x) => x.result)).toEqual(['FAIL', 'CONFLICT', 'OK'])
  })
})

describe('프로필 없음', () => {
  it('프로필이 비어 있으면 매칭하지 않는다(배지 숨김)', () => {
    expect(isProfileSet({})).toBe(false)
    expect(isProfileSet({ indoorRequired: false })).toBe(false)
    expect(matchPlace(place('ALLOWED'), {})).toBeNull()
  })
})
