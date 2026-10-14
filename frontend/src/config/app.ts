import type { Category } from '../types/place'

// 카카오 JavaScript 키(브라우저 공개 키). 카카오 콘솔에서 사이트 도메인으로 제한한다.
// 비어 있으면 지도 없이 목록 전용 모드로 동작한다.
export const KAKAO_JS_KEY: string = import.meta.env.VITE_KAKAO_JS_KEY ?? ''

// 데이터셋 위치. STEP 4는 가상(Mock) 데이터, 실제 데이터는 STEP 6 가공 파이프라인 산출물.
export const DATASET_BASE: string = import.meta.env.VITE_DATASET_BASE || '/data/mock'

// 초기 검증 지역: 제주(D-2·D-6). 위치 권한이 없을 때의 기준점 = 제주시청
export const DEFAULT_REGION_CODE = '50'
export const DEFAULT_CENTER = { lat: 33.4996, lng: 126.5312 }

export const categories: { id: Category; name: string; icon: string }[] = [
  { id: 'RESTAURANT', name: '음식점', icon: '🍽️' },
  { id: 'CAFE', name: '카페', icon: '☕' },
  { id: 'STAY', name: '숙소', icon: '🏨' },
  { id: 'ATTRACTION', name: '관광지', icon: '🌳' },
]

export const radiusOptions = [1000, 3000, 5000, 10000] as const
export type SearchRadius = (typeof radiusOptions)[number]
export const DEFAULT_RADIUS: SearchRadius = 3000
