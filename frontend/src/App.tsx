import { useCallback, useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { sourceLabel } from './components/labels'
import { MapView } from './components/MapView'
import { MatchFilter, type MatchFilterValue } from './components/MatchFilter'
import { PlaceCard } from './components/PlaceCard'
import { PlaceDetail } from './components/PlaceDetail'
import { ProfileSheet } from './components/ProfileSheet'
import { TopBar } from './components/TopBar'
import { categories, DEFAULT_CENTER, DEFAULT_RADIUS, type SearchRadius } from './config/app'
import { distanceMeters, type LatLng } from './domain/distance'
import { filterPlaces, type PetStatusFilter } from './domain/filters'
import { isProfileSet, matchPlace } from './domain/match'
import { regionsForCircle } from './domain/regions'
import { useManifest, useRegionPlaces } from './hooks/useDataset'
import { useGeolocation } from './hooks/useGeolocation'
import { usePlaceRoute } from './hooks/usePlaceRoute'
import { profileSummary, useProfile } from './hooks/useProfile'
import type { SearchCandidate } from './services/kakaoSearch'
import type { Category } from './types/place'

type SearchCenter = LatLng & { label: string }

export default function App() {
  const manifestState = useManifest()
  const manifest = manifestState.status === 'ready' ? manifestState.manifest : null
  const { profile, setProfile } = useProfile()
  const { geo, locate } = useGeolocation()
  const { placeId, open: openDetail, close: closeDetail } = usePlaceRoute()

  const [center, setCenter] = useState<SearchCenter>({ ...DEFAULT_CENTER, label: '제주시청(기본 위치)' })
  const [fitKey, setFitKey] = useState(0) // 새 검색마다 증가 → 지도를 반경에 맞춤
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(() => new Set(categories.map((c) => c.id)))
  const [radius, setRadius] = useState<SearchRadius>(DEFAULT_RADIUS)
  const [statusFilter, setStatusFilter] = useState<PetStatusFilter>('ALLOWED_ONLY')
  const [selectedId, setSelectedId] = useState<string>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [matchFilter, setMatchFilter] = useState<MatchFilterValue>('ALL')

  const regionCodes = useMemo(() => (manifest ? regionsForCircle(manifest, center, radius) : []), [manifest, center, radius])
  const placesState = useRegionPlaces(manifest, regionCodes)

  const results = useMemo(
    () => (placesState.status === 'ready' ? filterPlaces(placesState.places, center, radius, selectedCats, statusFilter) : []),
    [placesState, center, radius, selectedCats, statusFilter],
  )

  // 프로필 변경은 네트워크 없이 매칭만 다시 계산한다(아키텍처 §7)
  const profileOn = isProfileSet(profile)
  const matched = useMemo(() => results.map((r) => ({ ...r, match: matchPlace(r.place, profile) })), [results, profile])
  const matchCounts = useMemo(() => {
    const counts: Record<MatchFilterValue, number> = { ALL: matched.length, MATCH: 0, NEEDS_CONFIRMATION: 0, MISMATCH: 0 }
    for (const m of matched) if (m.match) counts[m.match.status] += 1
    return counts
  }, [matched])
  const visible = useMemo(
    () => (profileOn && matchFilter !== 'ALL' ? matched.filter((m) => m.match?.status === matchFilter) : matched),
    [matched, profileOn, matchFilter],
  )
  const visiblePlaces = useMemo(() => visible.map((v) => v.place), [visible])

  // 상세: 목록에 보이지 않는 장소(공유 링크)도 열 수 있도록 불러온 전체 데이터에서 찾는다
  const detailPlace = placeId && placesState.status === 'ready' ? placesState.places.find((p) => p.id === placeId) : undefined
  const detailMissing = Boolean(placeId) && placesState.status === 'ready' && !detailPlace

  const moveTo = useCallback((next: SearchCenter) => {
    setCenter(next)
    setSelectedId(undefined)
    setFitKey((k) => k + 1)
  }, [])

  const onLocate = async () => {
    const pos = await locate()
    if (pos) moveTo({ ...pos, label: '내 위치' })
  }
  const onPick = (c: SearchCandidate) => moveTo({ lat: c.lat, lng: c.lng, label: c.name })
  const onSearchHere = useCallback((c: LatLng) => moveTo({ ...c, label: '지도에서 선택한 지역' }), [moveTo])

  const toggleCategory = (c: Category) =>
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const onSelect = useCallback((id: string) => setSelectedId(id), [])

  const loadError = manifestState.status === 'error' ? manifestState.message : placesState.status === 'error' ? placesState.message : null
  const ready = manifest !== null && (placesState.status === 'ready' || regionCodes.length === 0)

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-slate-50 text-slate-900">
      <TopBar locating={geo.status === 'locating'} onLocate={onLocate} onPick={onPick} />
      <FilterBar
        selected={selectedCats}
        onToggleCategory={toggleCategory}
        radius={radius}
        onRadius={setRadius}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        profileText={profileSummary(profile)}
        profileActive={profileOn}
        onOpenProfile={() => setProfileOpen(true)}
      />

      {manifest?.isMock && (
        <p className="mx-4 mb-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs text-amber-900" role="note">
          🧪 가상(Mock) 데이터로 보여주는 개발용 화면이에요. 실제 장소가 아닙니다.
        </p>
      )}
      {geo.status === 'error' && (
        <p className="mx-4 mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="status">
          📍 {geo.message}
        </p>
      )}

      <div className="h-[38dvh] shrink-0">
        <MapView
          searchCenter={center}
          myLocation={geo.status === 'ok' ? geo.position : undefined}
          radius={radius}
          places={visiblePlaces}
          selectedId={selectedId}
          fitKey={String(fitKey)}
          onSelect={onSelect}
          onSearchHere={onSearchHere}
        />
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6" aria-label="검색 결과">
        {loadError && (
          <p role="alert" className="text-rose-700">
            {loadError}
          </p>
        )}
        {!loadError && !ready && <p role="status">불러오는 중…</p>}
        {!loadError && ready && manifest && (
          <>
            <p className="mb-2 text-sm text-slate-600" aria-live="polite">
              <span className="font-medium text-slate-800">{center.label}</span> 기준 · {visible.length}곳 · 거리순
            </p>
            {profileOn && results.length > 0 && <MatchFilter value={matchFilter} counts={matchCounts} onChange={setMatchFilter} />}
            {selectedCats.has('STAY') && (
              <p className="mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="note">
                ⓘ 반려견 동반 숙소 공식 정보가 아직 적어요. 예약 전 숙소에 꼭 확인하세요.
              </p>
            )}
            {detailMissing && (
              <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800" role="alert">
                링크의 장소를 이 지역 데이터에서 찾을 수 없어요.{' '}
                <button type="button" onClick={closeDetail} className="underline">
                  닫기
                </button>
              </p>
            )}
            {regionCodes.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                이 지역은 아직 데이터가 없어요. 지금은 제주 지역만 볼 수 있어요.
              </p>
            ) : visible.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                {results.length === 0
                  ? '반경 안에 조건에 맞는 장소가 없어요. 반경을 넓히거나 "미확인 포함"을 선택해 보세요.'
                  : '이 매칭 상태의 장소가 없어요. "전체"를 눌러 다른 장소도 확인해 보세요.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {visible.map(({ place, distance, match }) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    distance={distance}
                    match={match}
                    selected={place.id === selectedId}
                    onSelect={() => {
                      setSelectedId(place.id)
                      openDetail(place.id)
                    }}
                  />
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">
              자료: {manifest.sources.map((src) => `${sourceLabel[src.source]}(${src.fetchedAt.slice(0, 10)})`).join(', ')}
              <br />
              정보 기준일 {manifest.generatedAt.slice(0, 10)} · 방문 전 업체에 꼭 확인하세요
            </p>
          </>
        )}
      </section>

      {detailPlace && (
        <PlaceDetail
          place={detailPlace}
          distance={distanceMeters(center, { lat: detailPlace.latitude, lng: detailPlace.longitude })}
          match={matchPlace(detailPlace, profile)}
          onClose={closeDetail}
        />
      )}

      <ProfileSheet open={profileOpen} profile={profile} onApply={setProfile} onClose={closeProfile} />
    </div>
  )
}
