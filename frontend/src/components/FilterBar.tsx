import { categories, radiusOptions, type SearchRadius } from '../config/app'
import { formatDistance } from '../domain/distance'
import type { CategoryTab, PetStatusFilter, SpaceFilter } from '../domain/filters'

type Props = {
  tab: CategoryTab
  onTab: (t: CategoryTab) => void
  centerLabel: string
  onLocationChip: () => void
  radius: SearchRadius
  onRadius: (r: SearchRadius) => void
  statusFilter: PetStatusFilter
  onStatusFilter: (f: PetStatusFilter) => void
  space: SpaceFilter
  onSpace: (s: SpaceFilter) => void
  profileText: string
  profileActive: boolean
  onOpenProfile: () => void
}

const chip = 'h-10 shrink-0 rounded-full px-3 text-sm font-medium ring-1 transition-colors'
const tabs: { id: CategoryTab; label: string }[] = [{ id: 'ALL', label: '전체' }, ...categories.map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` }))]

// 카테고리 탭(하나만 선택) + 필터 칩 줄. 탭은 좌우로 밀어서 본다
export function FilterBar(p: Props) {
  return (
    <div className="pb-2">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2" role="tablist" aria-label="카테고리">
        {tabs.map((t) => {
          const on = p.tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => p.onTab(t.id)}
              className={`h-11 shrink-0 border-b-2 px-3 text-sm whitespace-nowrap ${on ? 'border-orange-500 font-bold text-slate-900' : 'border-transparent text-slate-500'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={p.onLocationChip}
          aria-label={`검색 기준: ${p.centerLabel}. 다른 지역 검색`}
          className={`${chip} max-w-[12rem] truncate bg-orange-50 text-orange-700 ring-orange-200`}
        >
          📍 {p.centerLabel}
        </button>
        <button
          type="button"
          onClick={p.onOpenProfile}
          className={`${chip} ${p.profileActive ? 'bg-amber-100 text-amber-900 ring-amber-300' : 'bg-white text-slate-700 ring-slate-200'}`}
        >
          🐕 {p.profileText}
        </button>
        <label className="sr-only" htmlFor="radius">
          검색 반경
        </label>
        <select
          id="radius"
          value={p.radius}
          onChange={(e) => p.onRadius(Number(e.target.value) as SearchRadius)}
          className={`${chip} bg-white text-slate-700 ring-slate-200`}
        >
          {radiusOptions.map((r) => (
            <option key={r} value={r}>
              반경 {formatDistance(r)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="pet-status">
          동반 상태
        </label>
        <select
          id="pet-status"
          value={p.statusFilter}
          onChange={(e) => p.onStatusFilter(e.target.value as PetStatusFilter)}
          className={`${chip} bg-white text-slate-700 ring-slate-200`}
        >
          <option value="ALLOWED_ONLY">동반 가능만</option>
          <option value="INCLUDE_UNKNOWN">미확인 포함</option>
          <option value="ALL">전체</option>
        </select>
        <label className="sr-only" htmlFor="space">
          공간
        </label>
        <select
          id="space"
          value={p.space}
          onChange={(e) => p.onSpace(e.target.value as SpaceFilter)}
          className={`${chip} ${p.space === 'ANY' ? 'bg-white text-slate-700 ring-slate-200' : 'bg-amber-100 text-amber-900 ring-amber-300'}`}
        >
          <option value="ANY">공간 전체</option>
          <option value="INDOOR">실내 가능</option>
          <option value="OUTDOOR">실외 가능</option>
        </select>
      </div>
    </div>
  )
}
