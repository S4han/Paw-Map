// 위치 오류 안내 문구. GeolocationPositionError 코드: 1 거부, 2 위치 확인 불가, 3 시간 초과
export type GeoFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure'

export function geoFailureFromCode(code: number): GeoFailure {
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}

export function geoFailureMessage(f: GeoFailure): string {
  const tail = '지역 검색으로도 이용할 수 있어요'
  switch (f) {
    case 'denied':
      return `위치 권한이 꺼져 있어요. ${tail}`
    case 'timeout':
      return `위치를 찾는 데 시간이 오래 걸려요. 다시 시도하거나 ${tail}`
    case 'insecure':
      return `보안 연결(https)에서만 위치를 쓸 수 있어요. ${tail}`
    case 'unsupported':
      return `이 브라우저는 위치 기능을 지원하지 않아요. ${tail}`
    default:
      return `현재 위치를 확인할 수 없어요. ${tail}`
  }
}
