import { KAKAO_JS_KEY } from '../config/app'
import { loadKakaoMaps } from './kakao'

export type SearchCandidate = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

// 카카오 로컬 키워드 검색 결과 항목(사용하는 필드만). 좌표는 문자열이며 x = 경도, y = 위도
export type KakaoKeywordDoc = {
  id: string
  place_name: string
  address_name?: string
  road_address_name?: string
  x: string
  y: string
}

export class SearchError extends Error {}

export function toCandidates(docs: KakaoKeywordDoc[], limit = 5): SearchCandidate[] {
  return docs
    .map((d) => ({
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name || '',
      lat: Number(d.y),
      lng: Number(d.x),
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .slice(0, limit)
}

// 지역·주소·관광지명 검색. 버튼/Enter 로만 호출한다(입력 중 자동 호출 없음 — 무료량 보호)
export async function searchKeyword(query: string): Promise<SearchCandidate[]> {
  const q = query.trim()
  if (!q) return []
  const kakao = await loadKakaoMaps(KAKAO_JS_KEY).catch(() => {
    throw new SearchError('지역 검색을 쓸 수 없어요(지도 키 없음)')
  })
  return new Promise((resolve, reject) => {
    new kakao.maps.services.Places().keywordSearch(
      q,
      (data: KakaoKeywordDoc[], status: string) => {
        const S = kakao.maps.services.Status
        if (status === S.OK) resolve(toCandidates(data))
        else if (status === S.ZERO_RESULT) resolve([])
        // 무료 사용량 소진(429) 등도 SDK 에서는 ERROR 로 온다
        else reject(new SearchError('지금은 지역 검색을 쓸 수 없어요. 내 위치로 찾거나 잠시 후 다시 시도해 주세요'))
      },
      { size: 5 },
    )
  })
}
