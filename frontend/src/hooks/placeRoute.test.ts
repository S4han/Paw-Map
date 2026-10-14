import { describe, expect, it } from 'vitest'
import { parsePlaceHash, placeHash } from './placeHash'

describe('상세 화면 주소', () => {
  it('좌표를 붙여 만들고 다시 읽는다', () => {
    const h = placeHash('kcisa:ab12', { lat: 33.49961, lng: 126.531234 })
    expect(parsePlaceHash(h)).toEqual({ id: 'kcisa:ab12', at: { lat: 33.49961, lng: 126.53123 } })
  })
  it('예전 링크(좌표 없음)·다른 해시', () => {
    expect(parsePlaceHash('#/place/mock%3A1')).toEqual({ id: 'mock:1' })
    expect(parsePlaceHash('#/other')).toBeNull()
    expect(parsePlaceHash('#/place/')).toBeNull()
  })
})
