import type { ConditionField, Evidence, PetConditions, PetPlace } from '../types/place'

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

// 정보 출처 한 항목을 두 줄(출처·판정 / 날짜)로: 출처 이름을 되풀이하는 설명은 숨기고, 인허가 자료는 동반 판정 대신 영업 상태를 보인다
export function evidenceSummary(e: Pick<Evidence, 'source' | 'claim'>, label: string): { status?: string; claim?: string } {
  if (e.source.startsWith('MOIS_')) return { status: e.claim.split(': ')[1] || undefined }
  return { claim: e.claim.startsWith(label.split(' ')[0]) ? undefined : e.claim }
}

// 근거의 날짜 문구: 출처가 준 확인일과 우리가 받은 날을 섞지 않는다(요구사항 §7.2)
export function evidenceDateText(e: Evidence): string {
  const fetched = `조회 ${e.fetchedAt.slice(0, 10)}`
  return e.checkedAt ? `출처 수정·확인 ${e.checkedAt.slice(0, 10)} · ${fetched}` : `출처 확인일 정보 없음 · ${fetched}`
}

// 카드의 짧은 태그. 크기는 정보가 없어도 "크기 정보 없음"으로 보여 준다(모르는 것을 모른다고 표시)
export type CardTag = { text: string; tone: 'info' | 'muted' | 'warn' }

export function cardTags(place: Pick<PetPlace, 'category' | 'subcategory' | 'petConditions' | 'parkingAvailable'>): CardTag[] {
  const c = place.petConditions
  const tags: CardTag[] = []
  if (place.category === 'PET_SERVICE') {
    if (place.subcategory) tags.push({ text: place.subcategory, tone: 'info' })
  } else {
    if (c.conflicts.some((f) => f === 'maxWeightKg' || f === 'noWeightLimit')) tags.push({ text: '크기 출처마다 다름', tone: 'warn' })
    else if (c.noWeightLimit) tags.push({ text: '전 견종', tone: 'info' })
    else if (c.maxWeightKg !== undefined) tags.push({ text: `${c.maxWeightKg}kg ${c.maxWeightExclusive ? '미만' : '이하'}`, tone: 'info' })
    else tags.push({ text: '크기 정보 없음', tone: 'muted' })

    if (!c.conflicts.includes('indoorAllowed')) {
      if (c.indoorAllowed === true) tags.push({ text: '실내 가능', tone: 'info' })
      else if (c.indoorAllowed === false && c.outdoorAllowed === true) tags.push({ text: '실외만', tone: 'info' })
      else if (c.outdoorAllowed === true) tags.push({ text: '실외 가능', tone: 'info' })
    }
    if (c.maxDogs !== undefined && !c.conflicts.includes('maxDogs')) tags.push({ text: `최대 ${c.maxDogs}마리`, tone: 'info' })
  }
  if (place.parkingAvailable === true) tags.push({ text: '주차 가능', tone: 'info' })
  return tags
}

// 카드용 짧은 지역: "제주특별자치도 제주시 가상로 1" → "제주 제주시"
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전',
  울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 충청북도: '충북', 충청남도: '충남', 전라남도: '전남',
  경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 강원특별자치도: '강원', 강원도: '강원', 전북특별자치도: '전북', 전라북도: '전북',
}

export function shortRegion(address: string | undefined): string {
  const [first = '', second = ''] = (address ?? '').trim().split(/\s+/)
  const short = SIDO_SHORT[first]
  if (short) return `${short} ${second}`.trim()
  return first
}
