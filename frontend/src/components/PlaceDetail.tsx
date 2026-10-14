import { useEffect, useRef, useState } from 'react'
import { conditionRows, evidenceDateText, type RowState } from '../domain/conditions'
import { REPORT_ISSUES_NEW_URL } from '../config/app'
import { formatDistance } from '../domain/distance'
import { freshness, freshnessAdvice } from '../domain/freshness'
import { directionLinks, reportIssueUrl, secureImageUrl, telHref } from '../domain/links'
import type { MatchResult } from '../domain/match'
import type { PetPlace } from '../types/place'
import { categoryLabel, evidenceTypeLabel, matchLabel, petStatusLabel, sourceLabel } from './labels'

type Props = {
  place: PetPlace
  distance: number | null
  match: MatchResult | null
  favorite: boolean
  onToggleFavorite: () => void
  onClose: () => void
}

const stateIcon: Record<RowState, string> = { YES: '✅', NO: '🚫', UNKNOWN: '❔', CONFLICT: '⚠️', INFO: '•' }
const reasonIcon = { OK: '✅', FAIL: '🚫', UNKNOWN: '❔', CONFLICT: '⚠️' } as const
const imageCredit = { Type1: '공공누리 제1유형', Type3: '공공누리 제3유형(변경 금지)' } as const

// 장소 상세(요구사항 FR-007, US-05). 전체 화면 대화상자, Esc·뒤로가기로 닫힘
export function PlaceDetail({ place, distance, match, favorite, onToggleFavorite, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  const [imageOk, setImageOk] = useState(true)
  const status = petStatusLabel[place.petStatus]
  const tel = telHref(place.phone)
  const image = imageOk ? secureImageUrl(place.imageUrl) : null
  const fresh = freshness(place)
  const advice = freshnessAdvice(fresh)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copyAddress = async () => {
    if (!place.address) return
    try {
      await navigator.clipboard.writeText(place.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('주소를 복사하세요', place.address)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="detail-title" className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-2 py-2 shadow-sm backdrop-blur">
          <button ref={closeRef} type="button" onClick={onClose} aria-label="목록으로 돌아가기" className="h-11 w-11 text-xl">
            ←
          </button>
          <h2 id="detail-title" className="min-w-0 flex-1 truncate text-lg font-bold">
            {place.name}
          </h2>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? '저장 해제' : '이 장소 저장'}
            className={`h-11 shrink-0 rounded-full px-3 text-sm font-medium ring-1 ${favorite ? 'bg-amber-100 text-amber-900 ring-amber-300' : 'bg-white text-slate-700 ring-slate-200'}`}
          >
            {favorite ? '★ 저장됨' : '☆ 저장'}
          </button>
        </header>

        {image && (
          <figure className="bg-slate-200">
            {/* 공공누리 제3유형은 변경 금지 → 잘라내지 않고 비율 그대로(contain) */}
            <img src={image} alt={`${place.name} 사진`} onError={() => setImageOk(false)} className="h-56 w-full object-contain" loading="lazy" />
            {place.imageCopyright && (
              <figcaption className="bg-white px-4 py-1 text-[11px] text-slate-500">사진: 한국관광공사 · {imageCredit[place.imageCopyright]}</figcaption>
            )}
          </figure>
        )}

        <div className="space-y-4 px-4 pt-4">
          <section>
            <p className="text-sm text-slate-600">
              {categoryLabel[place.category]}
              {distance !== null && ` · ${formatDistance(distance)}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-sm font-medium ring-1 ${status.className}`}>
                {status.icon} {status.text}
              </span>
              {match && (
                <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${matchLabel[match.status].className}`}>
                  {matchLabel[match.status].icon} {matchLabel[match.status].text}
                </span>
              )}
              {place.conflictingEvidence && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-800 ring-1 ring-amber-200">⚠️ 출처 간 정보 충돌</span>
              )}
            </div>
          </section>

          {match && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="match-title">
              <h3 id="match-title" className="font-semibold">
                내 반려견 기준
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {match.reasons.map((r) => (
                  <li key={r.field}>
                    {reasonIcon[r.result]} {r.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="cond-title">
            <h3 id="cond-title" className="font-semibold">
              반려견 동반 조건
            </h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {conditionRows(place.petConditions).map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-slate-500">{r.label}</dt>
                  <dd className={r.state === 'UNKNOWN' ? 'text-slate-400' : ''}>
                    {stateIcon[r.state]} {r.value}
                  </dd>
                </div>
              ))}
            </dl>
            {place.petConditions.notes.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-semibold text-slate-500">원문</p>
                {place.petConditions.notes.map((n) => (
                  <p key={n}>“{n}”</p>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="src-title">
            <h3 id="src-title" className="font-semibold">
              정보 출처
            </h3>
            {place.evidence.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">동반 여부를 알려 주는 출처가 없어요.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {place.evidence.map((e, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {sourceLabel[e.source]} <span className="text-xs text-slate-500">({evidenceTypeLabel[e.type]})</span> · {petStatusLabel[e.petStatus].text}
                    </p>
                    <p className="text-slate-600">{e.claim}</p>
                    <p className="text-xs text-slate-500">{evidenceDateText(e)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {advice && (
            <p
              className={`rounded-xl px-3 py-2 text-sm ring-1 ${fresh.level === 'NO_DATE' ? 'bg-slate-100 text-slate-700 ring-slate-200' : 'bg-amber-50 text-amber-900 ring-amber-300'}`}
              role="note"
            >
              🕒 {fresh.text}. {advice}
            </p>
          )}

          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="note">
            ⚠️ 동반 조건은 바뀔 수 있어요. 방문 전에 업체에 꼭 확인하세요.
            {place.category === 'STAY' && ' 예약 가능 여부·객실 조건은 예약 사이트나 숙소에서 확인해야 해요.'}
          </p>

          <section className="space-y-2" aria-label="연락·길찾기">
            {place.address && (
              <div className="flex items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <p className="min-w-0 flex-1 text-sm">📍 {place.address}</p>
                <button type="button" onClick={copyAddress} className="h-10 shrink-0 rounded-lg bg-slate-100 px-3 text-sm">
                  {copied ? '복사됨' : '주소 복사'}
                </button>
              </div>
            )}
            {tel ? (
              <a href={tel} className="flex h-12 items-center justify-center rounded-xl bg-orange-500 font-semibold text-white">
                📞 전화하기 {place.phone}
              </a>
            ) : (
              <p className="text-center text-xs text-slate-500">전화번호 정보가 없어요. 아래 지도 앱에서 확인할 수 있어요.</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {directionLinks(place).map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-medium ring-1 ring-slate-200">
                  {l.label} ↗
                </a>
              ))}
            </div>
            {place.bookingUrl && (
              <a href={place.bookingUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-medium ring-1 ring-slate-200">
                예약 사이트로 이동 ↗ <span className="ml-1 text-xs text-slate-500">(예약 가능 여부는 사이트에서 확인)</span>
              </a>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200" aria-labelledby="report-title">
            <h3 id="report-title" className="font-semibold">
              정보가 다른가요?
            </h3>
            <p className="mt-1 text-slate-600">
              제보는 바로 반영되지 않고, 다음 데이터 갱신 때 확인한 뒤 반영해요. GitHub 계정이 필요하고 제보 내용은 공개돼요.
            </p>
            <a
              href={reportIssueUrl(REPORT_ISSUES_NEW_URL, place)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex h-11 items-center justify-center rounded-xl bg-slate-100 font-medium"
            >
              정보 수정 제보하기 ↗
            </a>
          </section>
        </div>
      </div>
    </div>
  )
}
