// 카카오맵 JS SDK 로더. 키가 없거나 로드에 실패하면 reject → 화면은 목록 전용 모드로 동작한다.
// SDK 타입 정의를 따로 두지 않고 사용하는 최소 범위만 any 로 다룬다.

declare global {
  interface Window {
    kakao?: any
  }
}

let loading: Promise<any> | null = null

export function loadKakaoMaps(appKey: string): Promise<any> {
  if (!appKey) return Promise.reject(new Error('카카오 지도 키가 설정되지 않았어요'))
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services,clusterer`
    script.async = true
    script.onload = () => window.kakao?.maps?.load(() => resolve(window.kakao))
    script.onerror = () => {
      loading = null
      reject(new Error('지도를 불러오지 못했어요'))
    }
    document.head.appendChild(script)
  })
  return loading
}
