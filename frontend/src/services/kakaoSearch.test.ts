import { describe, expect, it } from 'vitest'
import { toCandidates } from './kakaoSearch'

describe('toCandidates', () => {
  it('x=경도, y=위도로 변환하고 도로명 주소를 우선한다', () => {
    const [c] = toCandidates([
      { id: '1', place_name: '제주시청', address_name: '지번', road_address_name: '도로명', x: '126.5312', y: '33.4996' },
    ])
    expect(c).toEqual({ id: '1', name: '제주시청', address: '도로명', lat: 33.4996, lng: 126.5312 })
  })

  it('좌표가 숫자가 아니면 버리고, 개수를 제한한다', () => {
    const docs = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, place_name: `p${i}`, x: '126.5', y: i === 0 ? 'bad' : '33.5' }))
    const r = toCandidates(docs)
    expect(r).toHaveLength(5)
    expect(r[0].id).toBe('1')
  })
})
