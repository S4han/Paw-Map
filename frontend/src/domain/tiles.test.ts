import { describe, expect, it } from 'vitest'
import type { DatasetManifest } from '../types/place'
import { tileKey, tilesForCircle } from './tiles'

const manifest = (keys: string[]): DatasetManifest => ({
  version: 'v',
  generatedAt: 'x',
  isMock: false,
  sources: [],
  regions: [],
  tileDeg: 0.1,
  tiles: keys.map((key) => ({ key, count: 1, servicesCount: 0 })),
})

describe('격자 칸', () => {
  it('가공 파이프라인과 같은 칸 키', () => {
    expect(tileKey(33.5, 126.53, 0.1)).toBe('335_1265')
    expect(tileKey(0.3, 0.3, 0.1)).toBe('3_3') // 부동소수 오차로 2_2 가 되지 않음
    expect(tileKey(37.5665, 126.978, 0.1)).toBe('375_1269')
  })

  it('반경에 걸치는 칸 중 데이터가 있는 칸만', () => {
    const m = manifest(['334_1265', '335_1265', '335_1266', '340_1270'])
    expect(tilesForCircle(m, { lat: 33.55, lng: 126.55 }, 1000)).toEqual(['335_1265'])
    expect(tilesForCircle(m, { lat: 33.5, lng: 126.6 }, 3000).sort()).toEqual(['334_1265', '335_1265', '335_1266'])
    expect(tilesForCircle(manifest([]), { lat: 33.5, lng: 126.5 }, 3000)).toEqual([])
    expect(tilesForCircle({ ...m, tiles: undefined }, { lat: 33.5, lng: 126.5 }, 3000)).toEqual([])
  })
})
