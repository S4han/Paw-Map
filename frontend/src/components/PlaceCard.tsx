import { useEffect, useRef, useState } from 'react'
import { categories, serviceTypes } from '../config/app'
import { cardTags, shortRegion, type CardTag } from '../domain/conditions'
import { formatDistance } from '../domain/distance'
import { freshness } from '../domain/freshness'
import { secureImageUrl } from '../domain/links'
import type { MatchResult } from '../domain/match'
import type { PetPlace } from '../types/place'
import { categoryLabel, matchLabel, petStatusLabel, sourceLabel } from './labels'

type Props = {
  place: PetPlace
  distance: number
  selected: boolean
  match: MatchResult | null
  favorite: boolean
  onToggleFavorite: () => void
  onSelect: () => void
}

const tagTone: Record<CardTag['tone'], string> = {
  info: 'bg-orange-50 text-orange-800',
  muted: 'bg-slate-100 text-slate-500',
  warn: 'bg-amber-50 text-amber-800',
}
const icon: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.icon]))
const serviceIcon: Record<string, string> = Object.fromEntries(serviceTypes.map((t) => [t.id, t.icon]))

// 장소 카드: 왼쪽 사진(없으면 카테고리 아이콘) + ♡ 저장, 오른쪽 이름·지역·거리·태그·판정.
// 누르면 선택(지도 이름표) + 상세 화면
export function PlaceCard({ place, distance, selected, match, favorite, onToggleFavorite, onSelect }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [imageOk, setImageOk] = useState(true)
  const status = petStatusLabel[place.petStatus]
  const main = place.evidence[0]
  const fresh = freshness(place)
  const image = imageOk ? secureImageUrl(place.imageUrl) : null
  const region = shortRegion(place.address)

  // 지도 마커로 선택되면 목록에서 해당 카드를 보이게 한다
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <li className="relative">
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={`flex w-full gap-3 rounded-2xl bg-white p-3 text-left ring-1 ${selected ? 'ring-2 ring-orange-400' : 'ring-slate-200'}`}
      >
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-50 text-3xl" aria-hidden="true">
          {image ? <img src={image} alt="" onError={() => setImageOk(false)} className="h-full w-full object-cover" loading="lazy" /> : (place.subcategory && serviceIcon[place.subcategory]) || icon[place.category]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{place.name}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {categoryLabel[place.category]}
            {place.subcategory && ` · ${place.subcategory}`}
            {region && ` · ${region}`} · {formatDistance(distance)}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {/* 반려 생활 시설에 동반 정보가 없으면 '미확인' 배지를 달지 않는다(동반 장소가 아니므로) */}
            {!(place.category === 'PET_SERVICE' && place.petStatus === 'UNKNOWN') && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${status.className}`}>
                {status.icon} {status.text}
              </span>
            )}
            {match && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${matchLabel[match.status].className}`}>
                {matchLabel[match.status].icon} {matchLabel[match.status].text}
              </span>
            )}
            {place.conflictingEvidence && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">⚠️ 출처 간 정보 충돌</span>
            )}
            {cardTags(place).map((t) => (
              <span key={t.text} className={`rounded-md px-1.5 py-0.5 text-xs ${tagTone[t.tone]}`}>
                {t.text}
              </span>
            ))}
          </span>
          {match && match.status !== 'MATCH' && (
            // 왜 적합이 아닌지: 불일치·충돌·정보 없음 사유를 먼저(요구사항 AC-01-5)
            <span className="mt-1.5 block text-xs text-slate-700">
              {match.reasons.map((r) => (r.result === 'OK' ? `${r.message} ✓` : r.message)).join(' · ')}
            </span>
          )}
          <span className="mt-1.5 block truncate text-xs text-slate-500">
            {main ? sourceLabel[main.source] : '동반 정보 출처 없음'} ·{' '}
            <span className={fresh.level === 'STALE' || fresh.level === 'AGING' ? 'font-medium text-amber-700' : ''}>{fresh.text}</span>
          </span>
        </span>
      </button>
      {/* 사진 위 ♡: 카드 버튼과 겹치지 않게 별도 버튼 */}
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? '저장 해제' : '저장'}
        className={`absolute top-4 left-[4.25rem] grid h-8 w-8 place-items-center rounded-full bg-white/85 text-lg shadow-sm ${favorite ? 'text-orange-500' : 'text-slate-600'}`}
      >
        {favorite ? '♥' : '♡'}
      </button>
    </li>
  )
}
