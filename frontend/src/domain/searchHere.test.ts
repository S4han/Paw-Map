import { describe, expect, it } from 'vitest'
import { searchHereThreshold, shouldOfferSearchHere } from './searchHere'

const base = { lat: 33.4996, lng: 126.5312 }

describe('이 지역 검색 버튼', () => {
  it('임계값은 반경의 30%, 최소 300m', () => {
    expect(searchHereThreshold(1000)).toBe(300)
    expect(searchHereThreshold(10000)).toBe(3000)
  })

  it('조금 움직이면 숨기고, 충분히 움직이면 보인다', () => {
    // 위도 0.002도 ≈ 222m, 0.01도 ≈ 1.1km
    expect(shouldOfferSearchHere(base, { lat: base.lat + 0.002, lng: base.lng }, 3000)).toBe(false)
    expect(shouldOfferSearchHere(base, { lat: base.lat + 0.01, lng: base.lng }, 3000)).toBe(true)
    expect(shouldOfferSearchHere(base, { lat: base.lat + 0.01, lng: base.lng }, 10000)).toBe(false)
  })
})
