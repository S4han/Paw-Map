import { describe, expect, it } from 'vitest'
import type { Evidence, PetConditions, PetPlace } from '../types/place'
import { cardTags, conditionRows, evidenceDateText, shortRegion } from './conditions'
import { directionLinks, secureImageUrl, telHref } from './links'

const cond = (c: Partial<PetConditions> = {}): PetConditions => ({ notes: [], fieldSources: {}, conflicts: [], ...c })
const row = (c: PetConditions, label: string) => conditionRows(c).find((r) => r.label === label)!

describe('conditionRows', () => {
  it('값이 없는 항목도 숨기지 않고 "정보 없음"으로 보여 준다', () => {
    const rows = conditionRows(cond())
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.state === 'UNKNOWN' && r.value === '정보 없음')).toBe(true)
  })

  it('몸무게: 이하/미만/전 견종/충돌', () => {
    expect(row(cond({ maxWeightKg: 12 }), '몸무게').value).toBe('12kg 이하')
    expect(row(cond({ maxWeightKg: 15, maxWeightExclusive: true }), '몸무게').value).toBe('15kg 미만')
    expect(row(cond({ noWeightLimit: true }), '몸무게')).toEqual({ label: '몸무게', value: '제한 없음(전 견종)', state: 'YES' })
    expect(row(cond({ conflicts: ['maxWeightKg'] }), '몸무게').state).toBe('CONFLICT')
  })

  it('불리언 조건은 true/false/없음/충돌을 구분한다', () => {
    expect(row(cond({ indoorAllowed: true }), '실내 동반')).toEqual({ label: '실내 동반', value: '가능', state: 'YES' })
    expect(row(cond({ indoorAllowed: false }), '실내 동반').state).toBe('NO')
    expect(row(cond({ conflicts: ['indoorAllowed'], indoorAllowed: true }), '실내 동반').state).toBe('CONFLICT')
    expect(row(cond({ leashRequired: true }), '목줄').value).toBe('필수')
  })

  it('추가 요금은 원 단위로', () => {
    expect(row(cond({ additionalFeeKRW: 20000 }), '추가 요금').value).toBe('20,000원')
    expect(row(cond({ additionalFeeKRW: 0 }), '추가 요금').value).toBe('없음')
  })
})

describe('evidenceDateText', () => {
  const base: Evidence = { source: 'KTO_PET', type: 'OFFICIAL', petStatus: 'ALLOWED', fetchedAt: '2026-10-13T09:00:00+09:00', claim: 'x' }
  it('확인일과 조회일을 다른 말로 구분한다', () => {
    expect(evidenceDateText({ ...base, checkedAt: '2026-08-01' })).toBe('출처 수정·확인 2026-08-01 · 조회 2026-10-13')
    expect(evidenceDateText(base)).toBe('출처 확인일 정보 없음 · 조회 2026-10-13')
  })
})

describe('links', () => {
  const place = { name: '카페, 에벤에셀', latitude: 33.5, longitude: 126.53, address: '제주특별자치도 제주시 연동 1' }

  it('카카오는 위도 먼저, 이름의 쉼표는 공백으로', () => {
    const kakao = directionLinks(place).find((l) => l.id === 'kakao')!
    expect(kakao.url).toBe(`https://map.kakao.com/link/to/${encodeURIComponent('카페  에벤에셀')},33.5,126.53`)
  })

  it('Google 은 api=1 과 이름+주소 검색, 주소가 없으면 좌표', () => {
    const g = directionLinks(place).find((l) => l.id === 'google')!
    expect(g.url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true)
    expect(decodeURIComponent(g.url.split('query=')[1])).toBe('카페, 에벤에셀 제주특별자치도 제주시 연동 1')
    const noAddr = directionLinks({ ...place, address: undefined }).find((l) => l.id === 'google')!
    expect(decodeURIComponent(noAddr.url.split('query=')[1])).toBe('33.5,126.53')
  })

  it('전화번호 형식이 아니면 tel 링크를 만들지 않는다', () => {
    expect(telHref('064-000-0001')).toBe('tel:0640000001')
    expect(telHref('문의')).toBeNull()
    expect(telHref(undefined)).toBeNull()
  })

  it('http 이미지는 https 로', () => {
    expect(secureImageUrl('http://tong.visitkorea.or.kr/a.jpg')).toBe('https://tong.visitkorea.or.kr/a.jpg')
    expect(secureImageUrl(undefined)).toBeNull()
  })
})

describe('cardTags', () => {
  const tags = (c: Partial<PetConditions>, extra: Partial<Pick<PetPlace, 'category' | 'subcategory' | 'parkingAvailable'>> = {}) =>
    cardTags({ category: 'CAFE', petConditions: cond(c), ...extra }).map((t) => t.text)

  it('크기는 정보가 없어도 "크기 정보 없음"으로 보여 준다', () => {
    expect(tags({})).toEqual(['크기 정보 없음'])
    expect(tags({ noWeightLimit: true })).toEqual(['전 견종'])
    expect(tags({ maxWeightKg: 10, maxWeightExclusive: true })).toEqual(['10kg 미만'])
    expect(tags({ conflicts: ['maxWeightKg'] })).toEqual(['크기 출처마다 다름'])
  })

  it('실내·실외·마릿수·주차', () => {
    expect(tags({ maxWeightKg: 5, indoorAllowed: true, maxDogs: 2 }, { parkingAvailable: true })).toEqual(['5kg 이하', '실내 가능', '최대 2마리', '주차 가능'])
    expect(tags({ indoorAllowed: false, outdoorAllowed: true })).toEqual(['크기 정보 없음', '실외만'])
    expect(tags({}, { parkingAvailable: false })).toEqual(['크기 정보 없음']) // 주차 불가는 태그로 강조하지 않음
  })

  it('반려 생활은 세부 분류만', () => {
    expect(tags({}, { category: 'PET_SERVICE', subcategory: '동물병원' })).toEqual(['동물병원'])
  })
})

describe('shortRegion', () => {
  it('시도 이름을 줄이고 시군구까지만', () => {
    expect(shortRegion('제주특별자치도 제주시 가상로 1')).toBe('제주 제주시')
    expect(shortRegion('서울특별시 중구 세종대로 1')).toBe('서울 중구')
    expect(shortRegion('전라북도 전주시 완산구')).toBe('전북 전주시')
    expect(shortRegion('제주시 가상로 1')).toBe('제주시')
    expect(shortRegion(undefined)).toBe('')
  })
})
