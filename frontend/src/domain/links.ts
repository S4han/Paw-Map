import type { PetPlace } from '../types/place'

// 외부 지도·전화 링크(요구사항 FR-007, AC-05-2). 비용 없는 공개 URL 형식만 쓴다.
// - 카카오맵 길찾기: map.kakao.com/link/to/{이름},{위도},{경도} (위도 먼저, api-analysis §3.3 🔷)
// - Google 지도 검색: Maps URLs `search/?api=1&query=` (공식 문서 🔷). 좌표만 넣으면 핀만 보여서 이름+주소를 우선
// - 네이버지도: 웹 길찾기 형식은 공식 문서를 확인하지 못해(❓) 장소 검색 링크로 대신하고 실기기에서 확인(V-12)

export type ExternalLink = { id: 'kakao' | 'naver' | 'google'; label: string; url: string }

export function directionLinks(place: Pick<PetPlace, 'name' | 'latitude' | 'longitude' | 'address'>): ExternalLink[] {
  // 카카오 링크는 쉼표로 값을 나누므로 이름 안의 쉼표는 공백으로 바꾼다
  const kakaoName = encodeURIComponent(place.name.replace(/,/g, ' '))
  const query = place.address ? `${place.name} ${place.address}` : `${place.latitude},${place.longitude}`
  return [
    { id: 'kakao', label: '카카오맵 길찾기', url: `https://map.kakao.com/link/to/${kakaoName},${place.latitude},${place.longitude}` },
    { id: 'naver', label: '네이버지도에서 보기', url: `https://map.naver.com/p/search/${encodeURIComponent(place.name)}` },
    { id: 'google', label: 'Google 지도에서 보기', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` },
  ]
}

// tel: 링크. 숫자·+만 남기고, 7자리 미만이면 전화번호로 보지 않는다
export function telHref(phone: string | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null
}

// 관광공사 이미지 URL은 http 로 오는 경우가 있어(실측 응답) https 페이지에서 섞인 콘텐츠가 되지 않게 https 로 요청한다
export function secureImageUrl(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/^http:\/\//i, 'https://')
}
