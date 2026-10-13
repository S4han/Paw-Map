import { useEffect, useRef, useState } from 'react'
import type { PetProfile } from '../types/place'

type Props = {
  open: boolean
  profile: PetProfile
  onApply: (p: PetProfile) => void
  onClose: () => void
}

const MIN_KG = 0.5
const MAX_KG = 100
const MAX_DOGS = 5

// 반려견 조건 패널(요구사항 §5). 매칭 판정은 STEP 7에서 연결한다.
export function ProfileSheet({ open, profile, onApply, onClose }: Props) {
  const [weight, setWeight] = useState('')
  const [dogs, setDogs] = useState<number | undefined>()
  const [indoor, setIndoor] = useState(false)
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setWeight(profile.weightKg?.toString() ?? '')
    setDogs(profile.dogCount)
    setIndoor(profile.indoorRequired ?? false)
    firstInput.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, profile, onClose])

  if (!open) return null

  const kg = weight.trim() === '' ? undefined : Number(weight)
  const kgError = kg !== undefined && (!Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG)

  const apply = () => {
    if (kgError) return
    onApply({
      weightKg: kg === undefined ? undefined : Math.round(kg * 10) / 10,
      dogCount: dogs,
      indoorRequired: indoor || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="w-full rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="profile-title" className="text-lg font-bold">
            내 반려견 조건
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-11 w-11 text-xl">
            ✕
          </button>
        </div>

        <label htmlFor="weight" className="mt-3 block text-sm font-semibold">
          몸무게
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            ref={firstInput}
            id="weight"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="예: 12"
            aria-invalid={kgError}
            aria-describedby="weight-help"
            className="h-11 w-28 rounded-xl bg-slate-100 px-3"
          />
          <span>kg</span>
        </div>
        <p id="weight-help" className={`mt-1 text-xs ${kgError ? 'text-rose-600' : 'text-slate-500'}`}>
          {kgError ? `${MIN_KG}~${MAX_KG}kg 사이로 입력해 주세요` : '여러 마리면 가장 무거운 아이 기준으로 입력해요'}
        </p>

        <span className="mt-4 block text-sm font-semibold" id="dogs-label">
          마릿수
        </span>
        <div className="mt-1 flex items-center gap-3" role="group" aria-labelledby="dogs-label">
          <button
            type="button"
            aria-label="한 마리 줄이기"
            disabled={!dogs}
            onClick={() => setDogs(dogs && dogs > 1 ? dogs - 1 : undefined)}
            className="h-11 w-11 rounded-xl bg-slate-100 text-lg disabled:opacity-40"
          >
            −
          </button>
          <span aria-live="polite" className="w-16 text-center">
            {dogs ? `${dogs}마리` : '미입력'}
          </span>
          <button
            type="button"
            aria-label="한 마리 늘리기"
            disabled={dogs === MAX_DOGS}
            onClick={() => setDogs((dogs ?? 0) + 1)}
            className="h-11 w-11 rounded-xl bg-slate-100 text-lg disabled:opacity-40"
          >
            +
          </button>
        </div>

        <label className="mt-4 flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm font-semibold">실내에 함께 들어가야 해요</span>
          <input type="checkbox" role="switch" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} className="h-6 w-6 accent-orange-500" />
        </label>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setWeight('')
              setDogs(undefined)
              setIndoor(false)
            }}
            className="h-12 flex-1 rounded-xl bg-slate-100 font-semibold"
          >
            초기화
          </button>
          <button type="button" onClick={apply} disabled={kgError} className="h-12 flex-[2] rounded-xl bg-orange-500 font-semibold text-white disabled:opacity-50">
            적용하기
          </button>
        </div>
      </div>
    </div>
  )
}
