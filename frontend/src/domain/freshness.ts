import type { PetPlace } from '../types/place'

// 정보 신선도(요구사항 P2 "신뢰도·신선도"). 기준은 출처가 준 확인일(lastVerifiedAt)뿐이다.
// 우리가 받은 시각(fetchedAt)은 확인일이 아니므로 쓰지 않는다(요구사항 §7.2).
// 날짜가 없다는 것은 "오래됐다"가 아니라 "모른다"이다 → NO_DATE 로 따로 표시한다.
export type FreshnessLevel = 'RECENT' | 'AGING' | 'STALE' | 'NO_DATE'
export type Freshness = { level: FreshnessLevel; text: string; ageDays?: number }

// 1년이 지나면 재확인 권장, 2년이 지나면 오래된 정보로 강조(STEP 10 기본안, 사용자 확인 전 조정 가능)
export const AGING_DAYS = 365
export const STALE_DAYS = 730

const DAY_MS = 86_400_000

export function freshness(place: Pick<PetPlace, 'lastVerifiedAt'>, now: Date = new Date()): Freshness {
  const date = place.lastVerifiedAt?.slice(0, 10)
  const time = date ? Date.parse(`${date}T00:00:00+09:00`) : NaN
  if (!date || Number.isNaN(time)) return { level: 'NO_DATE', text: '확인일 정보 없음' }

  const ageDays = Math.max(0, Math.floor((now.getTime() - time) / DAY_MS))
  if (ageDays >= STALE_DAYS) return { level: 'STALE', ageDays, text: `확인 ${date} · ${Math.floor(ageDays / 365)}년 넘은 정보` }
  if (ageDays >= AGING_DAYS) return { level: 'AGING', ageDays, text: `확인 ${date} · 1년 넘은 정보` }
  return { level: 'RECENT', ageDays, text: `확인 ${date}` }
}

// 상세 화면의 재확인 안내. 최근 정보에는 따로 띄우지 않는다(하단 공통 안내로 충분)
export function freshnessAdvice(f: Freshness): string | null {
  switch (f.level) {
    case 'STALE':
      return '확인한 지 2년이 넘은 정보예요. 그동안 동반 정책이 바뀌었을 수 있으니 방문 전에 꼭 전화로 확인하세요.'
    case 'AGING':
      return '확인한 지 1년이 넘은 정보예요. 방문 전에 업체에 확인해 보세요.'
    case 'NO_DATE':
      return '출처가 언제 확인한 정보인지 알려 주지 않았어요. 방문 전에 업체에 확인해 보세요.'
    default:
      return null
  }
}
