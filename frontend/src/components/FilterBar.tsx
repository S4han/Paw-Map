import { categories, radiusOptions, type SearchRadius } from '../config/app'
import { formatDistance } from '../domain/distance'
import type { PetStatusFilter } from '../domain/filters'
import type { Category } from '../types/place'

type Props = {
  selected: Set<Category>
  onToggleCategory: (c: Category) => void
  radius: SearchRadius
  onRadius: (r: SearchRadius) => void
  statusFilter: PetStatusFilter
  onStatusFilter: (f: PetStatusFilter) => void
  profileText: string
  profileActive: boolean
  onOpenProfile: () => void
}

const chip = 'h-10 shrink-0 rounded-full px-3 text-sm font-medium ring-1 transition-colors'

export function FilterBar(p: Props) {
  return (
    <div className="space-y-2 px-4 pb-2">
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="카테고리">
        {categories.map((c) => {
          const on = p.selected.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => p.onToggleCategory(c.id)}
              className={`${chip} ${on ? 'bg-orange-500 text-white ring-orange-500' : 'bg-white text-slate-700 ring-slate-200'}`}
            >
              {c.icon} {c.name}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 overflow-x-auto">
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
      </div>
    </div>
  )
}
