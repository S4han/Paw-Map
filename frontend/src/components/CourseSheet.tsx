import { useEffect, useRef } from 'react'
import type { Course } from '../domain/course'
import { formatDistance } from '../domain/distance'
import { categoryLabel, matchLabel } from './labels'

type Props = {
  open: boolean
  course: Course | null
  startLabel: string
  onOpenPlace: (id: string) => void
  onClose: () => void
}

// 반려견 여행 코스(요구사항 P2). 기준점에서 관광지 → 음식점 → 카페 순으로 가까운 동반 가능 장소를 잇는다.
export function CourseSheet({ open, course, startLabel, onOpenPlace, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !course) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 id="course-title" className="text-lg font-bold">
            🧭 반려견 동반 코스
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="코스 닫기" className="h-11 w-11 text-xl">
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-600">
          {startLabel}에서 출발 · 동반 가능 장소만 · 직선거리 합계 {formatDistance(course.totalMeters)}
        </p>

        {course.stops.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">근처에 코스로 묶을 동반 가능 장소가 없어요. 다른 지역에서 찾아보세요.</p>
        ) : (
          <ol className="mt-3 space-y-2" aria-label="코스 순서">
            {course.stops.map((s, i) => (
              <li key={s.place.id}>
                <button
                  type="button"
                  onClick={() => onOpenPlace(s.place.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-200"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-500 text-sm font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.place.name}</span>
                    <span className="block text-xs text-slate-500">
                      {categoryLabel[s.place.category]} · {i === 0 ? '출발점에서' : '앞 장소에서'} {formatDistance(s.legMeters)}
                    </span>
                  </span>
                  {s.match && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${matchLabel[s.match.status].className}`}>
                      {matchLabel[s.match.status].icon} {matchLabel[s.match.status].text}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}

        {course.missing.length > 0 && (
          <p className="mt-3 text-sm text-slate-600">
            코스에서 뺀 종류: {course.missing.map((c) => categoryLabel[c]).join('·')} (10km 안에 동반 가능한 곳이 없어요)
          </p>
        )}
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200" role="note">
          ⚠️ 직선거리로 고른 추천이에요. 실제 이동 경로·영업시간·휴무는 반영하지 않았으니 각 장소를 눌러 확인하고, 방문 전에 업체에 꼭 확인하세요.
        </p>
      </div>
    </div>
  )
}
