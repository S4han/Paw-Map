// 상단 바: 로고 · 지역 검색 · 현재 위치. 검색·GPS 연결은 STEP 5에서 구현한다(지금은 자리만 잡음).
export function TopBar() {
  return (
    <header className="flex items-center gap-2 px-4 pt-3 pb-2">
      <h1 className="shrink-0 text-lg font-extrabold tracking-tight text-orange-600">🐾 PAW MAP</h1>
      <form className="min-w-0 flex-1" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor="region-search">
          지역·주소·관광지 검색
        </label>
        <input
          id="region-search"
          type="search"
          disabled
          placeholder="지역·주소·관광지 검색 (준비 중)"
          className="h-11 w-full rounded-xl bg-slate-100 px-3 text-sm placeholder:text-slate-400 disabled:opacity-70"
        />
      </form>
      <button
        type="button"
        disabled
        aria-label="현재 위치로 찾기 (준비 중)"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg disabled:opacity-50"
      >
        ◎
      </button>
    </header>
  )
}
