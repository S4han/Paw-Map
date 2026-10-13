import { useState, type FormEvent } from 'react'
import { searchKeyword, type SearchCandidate } from '../services/kakaoSearch'

type Props = {
  locating: boolean
  onLocate: () => void
  onPick: (c: SearchCandidate) => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; items: SearchCandidate[] }
  | { status: 'error'; message: string }

// 상단 바: 로고 · 지역 검색(버튼/Enter 로만 호출) · 현재 위치
export function TopBar({ locating, onLocate, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim() || search.status === 'searching') return
    setSearch({ status: 'searching' })
    try {
      setSearch({ status: 'results', items: await searchKeyword(query) })
    } catch (err) {
      setSearch({ status: 'error', message: err instanceof Error ? err.message : '검색에 실패했어요' })
    }
  }

  const pick = (c: SearchCandidate) => {
    setQuery(c.name)
    setSearch({ status: 'idle' })
    onPick(c)
  }

  return (
    <header className="relative px-4 pt-3 pb-2">
      <div className="flex items-center gap-2">
        <h1 className="shrink-0 text-lg font-extrabold tracking-tight text-orange-600">🐾 PAW MAP</h1>
        <form className="flex min-w-0 flex-1 gap-1" role="search" onSubmit={submit}>
          <label className="sr-only" htmlFor="region-search">
            지역·주소·관광지 검색
          </label>
          <input
            id="region-search"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch({ status: 'idle' })}
            placeholder="지역·주소·관광지 검색"
            className="h-11 min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-sm placeholder:text-slate-400"
          />
          <button type="submit" aria-label="검색" className="h-11 w-11 shrink-0 rounded-xl bg-slate-100 text-lg">
            {search.status === 'searching' ? '…' : '🔍'}
          </button>
        </form>
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="현재 위치로 찾기"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg disabled:opacity-50"
        >
          {locating ? '…' : '◎'}
        </button>
      </div>

      {search.status === 'error' && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {search.message}
        </p>
      )}
      {search.status === 'results' && (
        <ul className="absolute right-4 left-4 z-30 mt-2 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200" aria-label="검색 결과 후보">
          {search.items.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-600">검색 결과가 없어요. 다른 이름으로 찾아보세요</li>
          ) : (
            search.items.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} className="block min-h-11 w-full px-4 py-2 text-left hover:bg-orange-50">
                  <span className="block text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-slate-500">{c.address}</span>
                </button>
              </li>
            ))
          )}
          <li>
            <button type="button" onClick={() => setSearch({ status: 'idle' })} className="block h-10 w-full text-sm text-slate-500">
              닫기
            </button>
          </li>
        </ul>
      )}
    </header>
  )
}
