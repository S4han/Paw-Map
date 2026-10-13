import { describe, expect, it } from 'vitest'
import type { DatasetManifest } from '../types/place'
import { regionsForCircle } from './regions'

const manifest: DatasetManifest = {
  version: 't',
  generatedAt: 't',
  isMock: true,
  sources: [],
  regions: [
    { code: '50', name: '제주', file: 'a', count: 0, bbox: [33.1, 126.1, 33.6, 127.0] },
    { code: '46', name: '전남', file: 'b', count: 0, bbox: [34.0, 125.0, 35.5, 127.9] },
  ],
}

describe('regionsForCircle', () => {
  it('제주시청 3km → 제주만', () => {
    expect(regionsForCircle(manifest, { lat: 33.4996, lng: 126.5312 }, 3000)).toEqual(['50'])
  })

  it('경계 밖(서울) → 없음', () => {
    expect(regionsForCircle(manifest, { lat: 37.5665, lng: 126.978 }, 10000)).toEqual([])
  })

  it('경계 근처에서 반경이 걸치면 두 지역 모두', () => {
    // 제주 bbox 북쪽 끝(33.6) 바로 위 33.95에서 반경 10km → 아래로 약 0.09도까지 → 33.86 → 제주 미포함, 전남(34.0~) 포함
    expect(regionsForCircle(manifest, { lat: 33.95, lng: 126.5 }, 10000)).toEqual(['46'])
    // 33.65에서 10km → 33.56~33.74 → 제주 포함, 전남 미포함
    expect(regionsForCircle(manifest, { lat: 33.65, lng: 126.5 }, 10000)).toEqual(['50'])
    // 33.8에서 30km → 33.53~34.07 → 둘 다
    expect(regionsForCircle(manifest, { lat: 33.8, lng: 126.5 }, 30000).sort()).toEqual(['46', '50'])
  })
})
