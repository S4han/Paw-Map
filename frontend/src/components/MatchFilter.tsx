import type { MatchStatus } from '../types/place'
import { matchLabel } from './labels'

export type MatchFilterValue = 'ALL' | MatchStatus

type Props = {
  value: MatchFilterValue
  counts: Record<MatchFilterValue, number>
  onChange: (v: MatchFilterValue) => void
}

const ORDER: MatchFilterValue[] = ['ALL', 'MATCH', 'NEEDS_CONFIRMATION', 'MISMATCH']

// 반려견 조건이 있을 때만 보이는 매칭 필터. 정렬은 거리순 그대로(요구사항 §6.4)
export function MatchFilter({ value, counts, onChange }: Props) {
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="내 반려견 조건 매칭">
      {ORDER.map((v) => {
        const on = v === value
        const text = v === 'ALL' ? '전체' : `${matchLabel[v].icon} ${matchLabel[v].text}`
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={`h-9 shrink-0 rounded-full px-3 text-xs font-medium ring-1 ${on ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-700 ring-slate-200'}`}
          >
            {text} {counts[v]}
          </button>
        )
      })}
    </div>
  )
}
