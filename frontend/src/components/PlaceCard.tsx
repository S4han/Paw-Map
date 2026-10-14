import { useEffect, useRef } from 'react'
import { formatDistance } from '../domain/distance'
import { freshness } from '../domain/freshness'
import type { MatchResult } from '../domain/match'
import type { PetPlace } from '../types/place'
import { categoryLabel, matchLabel, petStatusLabel, sourceLabel } from './labels'

type Props = {
  place: PetPlace
  distance: number
  selected: boolean
  match: MatchResult | null
  onSelect: () => void
}

// 장소 카드. 누르면 선택(지도 이름표) + 상세 화면
export function PlaceCard({ place, distance, selected, match, onSelect }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const status = petStatusLabel[place.petStatus]
  const main = place.evidence[0]
  const fresh = freshness(place)

  // 지도 마커로 선택되면 목록에서 해당 카드를 보이게 한다
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={`w-full rounded-2xl bg-white p-3 text-left ring-1 ${selected ? 'ring-2 ring-orange-400' : 'ring-slate-200'}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{place.name}</span>
          <span className="shrink-0 text-xs text-slate-500">
            {categoryLabel[place.category]} · {formatDistance(distance)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${status.className}`}>
            {status.icon} {status.text}
          </span>
          {match && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${matchLabel[match.status].className}`}>
              {matchLabel[match.status].icon} {matchLabel[match.status].text}
            </span>
          )}
          {place.conflictingEvidence && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              ⚠️ 출처 간 정보 충돌
            </span>
          )}
        </div>
        {match && match.status !== 'MATCH' && (
          // 왜 적합이 아닌지: 불일치·충돌·정보 없음 사유를 먼저(요구사항 AC-01-5)
          <p className="mt-1.5 text-xs text-slate-700">
            {match.reasons
              .map((r) => (r.result === 'OK' ? `${r.message} ✓` : r.message))
              .join(' · ')}
          </p>
        )}
        <p className="mt-1.5 text-xs text-slate-500">
          {main ? `${sourceLabel[main.source]} · ${main.claim}` : '동반 정보 출처 없음'} ·{' '}
          <span className={fresh.level === 'STALE' || fresh.level === 'AGING' ? 'font-medium text-amber-700' : ''}>{fresh.text}</span>
        </p>
      </button>
    </li>
  )
}
