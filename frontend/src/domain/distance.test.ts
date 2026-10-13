import { describe, expect, it } from 'vitest'
import { distanceMeters, formatDistance } from './distance'

describe('distanceMeters', () => {
  it('같은 점은 0', () => {
    expect(distanceMeters({ lat: 33.5, lng: 126.5 }, { lat: 33.5, lng: 126.5 })).toBe(0)
  })

  it('제주시청 ↔ 제주국제공항 약 3.6km', () => {
    const d = distanceMeters({ lat: 33.4996, lng: 126.5312 }, { lat: 33.5104, lng: 126.4914 })
    expect(d).toBeGreaterThan(3500)
    expect(d).toBeLessThan(3900)
  })
})

describe('formatDistance', () => {
  it('1km 미만은 m, 이상은 소수 1자리 km', () => {
    expect(formatDistance(349.6)).toBe('350m')
    expect(formatDistance(1234)).toBe('1.2km')
  })
})
