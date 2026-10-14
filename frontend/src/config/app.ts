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
  { id: 'PET_SERVICE', name: '반려 생활', icon: '🐾' },
]

// 처음 켜 두는 카테고리. 반려 생활은 기본으로 끈다(시설이 많아 동반 장소가 묻히지 않게, 사용자 결정 2026-10-14)
export const DEFAULT_CATEGORIES: Category[] = ['RESTAURANT', 'CAFE', 'STAY', 'ATTRACTION']

// 반려 생활 세부 종류(한국문화정보원 카테고리3 그대로). 탭 안에서 하나를 골라 볼 수 있다
export const serviceTypes: { id: string; name: string; icon: string }[] = [
  { id: '동물병원', name: '동물병원', icon: '🏥' },
  { id: '동물약국', name: '동물약국', icon: '💊' },
  { id: '미용', name: '미용', icon: '✂️' },
  { id: '반려동물용품', name: '용품', icon: '🛍️' },
]

// 정보 수정 제보를 받는 곳(공개 저장소 이슈). GitHub 계정이 있어야 작성할 수 있다
export const REPORT_ISSUES_NEW_URL = 'https://github.com/S4han/Paw-Map/issues/new'

export const radiusOptions = [1000, 3000, 5000, 10000] as const
export type SearchRadius = (typeof radiusOptions)[number]
export const DEFAULT_RADIUS: SearchRadius = 3000
