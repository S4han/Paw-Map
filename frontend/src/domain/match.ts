import type { ConditionField, MatchStatus, PetPlace, PetProfile } from '../types/place'

// 반려견 조건 매칭(요구사항 §6.3, Q-2, D-7). 순수 함수 — 화면·데이터 로딩과 무관하게 테스트로 고정한다.
// 원칙: 값이 없으면(undefined) 충족으로 보지 않는다. 유일한 예외는 Q-2(1마리 + 동반 가능).

export type ReasonField = 'petStatus' | 'weight' | 'dogCount' | 'indoor'
export type ReasonResult = 'OK' | 'FAIL' | 'UNKNOWN' | 'CONFLICT'
export type MatchReason = { field: ReasonField; result: ReasonResult; message: string }
export type MatchResult = { status: MatchStatus; reasons: MatchReason[] }

export function isProfileSet(p: PetProfile): boolean {
  return p.weightKg !== undefined || p.dogCount !== undefined || p.indoorRequired === true
}

const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}kg`

function weightReason(place: PetPlace, weightKg: number): MatchReason {
  const c = place.petConditions
  const conflict = (f: ConditionField) => c.conflicts.includes(f)
  if (conflict('maxWeightKg') || conflict('noWeightLimit') || conflict('maxWeightExclusive')) {
    return { field: 'weight', result: 'CONFLICT', message: '몸무게 기준이 출처마다 달라요' }
  }
  if (c.noWeightLimit) return { field: 'weight', result: 'OK', message: '몸무게 제한 없음(전 견종)' }
  if (c.maxWeightKg !== undefined) {
    const unit = c.maxWeightExclusive ? '미만' : '이하'
    const ok = c.maxWeightExclusive ? weightKg < c.maxWeightKg : weightKg <= c.maxWeightKg
    return ok
      ? { field: 'weight', result: 'OK', message: `${kg(c.maxWeightKg)} ${unit} 가능` }
      : { field: 'weight', result: 'FAIL', message: `몸무게 제한 ${kg(c.maxWeightKg)} ${unit}` }
  }
  return { field: 'weight', result: 'UNKNOWN', message: '몸무게 기준(kg) 정보 없음' }
}

function dogCountReason(place: PetPlace, dogCount: number): MatchReason {
  const c = place.petConditions
  if (c.conflicts.includes('maxDogs')) return { field: 'dogCount', result: 'CONFLICT', message: '최대 마릿수가 출처마다 달라요' }
  if (c.maxDogs !== undefined) {
    return dogCount <= c.maxDogs
      ? { field: 'dogCount', result: 'OK', message: `최대 ${c.maxDogs}마리 가능` }
      : { field: 'dogCount', result: 'FAIL', message: `최대 ${c.maxDogs}마리까지` }
  }
  // Q-2: '동반 가능'이 확인됐다는 것 자체가 최소 1마리 허용의 근거(이 함수는 ALLOWED 일 때만 호출됨)
  if (dogCount === 1) return { field: 'dogCount', result: 'OK', message: '1마리 동반' }
  return { field: 'dogCount', result: 'UNKNOWN', message: '최대 마릿수 정보 없음' }
}

function indoorReason(place: PetPlace): MatchReason {
  const c = place.petConditions
  if (c.conflicts.includes('indoorAllowed')) return { field: 'indoor', result: 'CONFLICT', message: '실내 동반 정보가 출처마다 달라요' }
  if (c.indoorAllowed === true) return { field: 'indoor', result: 'OK', message: '실내 가능' }
  if (c.indoorAllowed === false) return { field: 'indoor', result: 'FAIL', message: '실내 동반 불가' }
  return { field: 'indoor', result: 'UNKNOWN', message: '실내 동반 정보 없음' }
}

// 화면에 먼저 보여줄 순서: 불일치 → 충돌 → 정보 없음 → 충족
const ORDER: Record<ReasonResult, number> = { FAIL: 0, CONFLICT: 1, UNKNOWN: 2, OK: 3 }

export function matchPlace(place: PetPlace, profile: PetProfile): MatchResult | null {
  if (!isProfileSet(profile)) return null

  if (place.petStatus === 'NOT_ALLOWED') {
    return { status: 'MISMATCH', reasons: [{ field: 'petStatus', result: 'FAIL', message: '반려견 동반 불가' }] }
  }
  if (place.petStatus === 'UNKNOWN') {
    const message = place.conflictingEvidence ? '출처 간 정보 충돌' : '동반 여부 미확인'
    return { status: 'NEEDS_CONFIRMATION', reasons: [{ field: 'petStatus', result: place.conflictingEvidence ? 'CONFLICT' : 'UNKNOWN', message }] }
  }

  const reasons: MatchReason[] = []
  if (profile.weightKg !== undefined) reasons.push(weightReason(place, profile.weightKg))
  if (profile.dogCount !== undefined) reasons.push(dogCountReason(place, profile.dogCount))
  if (profile.indoorRequired) reasons.push(indoorReason(place))
  reasons.sort((a, b) => ORDER[a.result] - ORDER[b.result])

  const status: MatchStatus = reasons.some((r) => r.result === 'FAIL')
    ? 'MISMATCH'
    : reasons.some((r) => r.result === 'UNKNOWN' || r.result === 'CONFLICT')
      ? 'NEEDS_CONFIRMATION'
      : 'MATCH'
  return { status, reasons }
}
