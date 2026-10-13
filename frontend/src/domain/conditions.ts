import type { ConditionField, Evidence, PetConditions } from '../types/place'

// 상세 화면의 동반 조건 표. 값이 없는 항목은 숨기지 않고 "정보 없음"으로 보여 준다(모르는 것을 모른다고 표시).
export type RowState = 'YES' | 'NO' | 'UNKNOWN' | 'CONFLICT' | 'INFO'
export type ConditionRow = { label: string; value: string; state: RowState }

function boolRow(c: PetConditions, field: ConditionField, label: string, yes: string, no: string, yesState: RowState = 'YES'): ConditionRow {
  if (c.conflicts.includes(field)) return { label, value: '출처마다 달라요', state: 'CONFLICT' }
  const v = c[field as keyof PetConditions]
  if (v === true) return { label, value: yes, state: yesState }
  if (v === false) return { label, value: no, state: 'NO' }
  return { label, value: '정보 없음', state: 'UNKNOWN' }
}

export function conditionRows(c: PetConditions): ConditionRow[] {
  const weight: ConditionRow = c.conflicts.some((f) => f === 'maxWeightKg' || f === 'noWeightLimit')
    ? { label: '몸무게', value: '출처마다 달라요', state: 'CONFLICT' }
    : c.noWeightLimit
      ? { label: '몸무게', value: '제한 없음(전 견종)', state: 'YES' }
      : c.maxWeightKg !== undefined
        ? { label: '몸무게', value: `${c.maxWeightKg}kg ${c.maxWeightExclusive ? '미만' : '이하'}`, state: 'INFO' }
        : { label: '몸무게', value: '정보 없음', state: 'UNKNOWN' }

  const dogs: ConditionRow = c.conflicts.includes('maxDogs')
    ? { label: '최대 마릿수', value: '출처마다 달라요', state: 'CONFLICT' }
    : c.maxDogs !== undefined
      ? { label: '최대 마릿수', value: `${c.maxDogs}마리`, state: 'INFO' }
      : { label: '최대 마릿수', value: '정보 없음', state: 'UNKNOWN' }

  const fee: ConditionRow = c.conflicts.includes('additionalFeeKRW')
    ? { label: '추가 요금', value: '출처마다 달라요', state: 'CONFLICT' }
    : c.additionalFeeKRW !== undefined
      ? { label: '추가 요금', value: c.additionalFeeKRW === 0 ? '없음' : `${c.additionalFeeKRW.toLocaleString('ko-KR')}원`, state: 'INFO' }
      : { label: '추가 요금', value: '정보 없음', state: 'UNKNOWN' }

  return [
    weight,
    dogs,
    boolRow(c, 'indoorAllowed', '실내 동반', '가능', '불가'),
    boolRow(c, 'outdoorAllowed', '실외 동반', '가능', '불가'),
    boolRow(c, 'leashRequired', '목줄', '필수', '필수 아님', 'INFO'),
    boolRow(c, 'carrierRequired', '이동장', '필수', '필수 아님', 'INFO'),
    fee,
  ]
}

// 근거의 날짜 문구: 출처가 준 확인일과 우리가 받은 날을 섞지 않는다(요구사항 §7.2)
export function evidenceDateText(e: Evidence): string {
  const fetched = `조회 ${e.fetchedAt.slice(0, 10)}`
  return e.checkedAt ? `출처 수정·확인 ${e.checkedAt.slice(0, 10)} · ${fetched}` : `출처 확인일 정보 없음 · ${fetched}`
}
