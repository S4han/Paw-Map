import { describe, expect, it } from 'vitest'
import { geoFailureFromCode, geoFailureMessage } from './geolocation'

describe('위치 오류', () => {
  it('브라우저 오류 코드를 분류한다', () => {
    expect(geoFailureFromCode(1)).toBe('denied')
    expect(geoFailureFromCode(2)).toBe('unavailable')
    expect(geoFailureFromCode(3)).toBe('timeout')
  })

  it('모든 안내는 지역 검색이라는 대안을 알려 준다(위치 없이도 사용 가능, AC-04-1)', () => {
    for (const f of ['denied', 'unavailable', 'timeout', 'unsupported', 'insecure'] as const) {
      expect(geoFailureMessage(f).includes('지역 검색')).toBe(true)
    }
  })
})
