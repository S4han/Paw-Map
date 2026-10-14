import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CourseSheet } from './components/CourseSheet'
import { FilterBar } from './components/FilterBar'
import { sourceLabel, sourceLink } from './components/labels'
import { MapView } from './components/MapView'
import { MatchFilter, type MatchFilterValue } from './components/MatchFilter'
import { PlaceCard } from './components/PlaceCard'
import { PlaceDetail } from './components/PlaceDetail'
import { ProfileSheet } from './components/ProfileSheet'
import { TopBar } from './components/TopBar'
import { DEFAULT_CENTER, DEFAULT_RADIUS, serviceTypes, type SearchRadius } from './config/app'
import { buildCourse } from './domain/course'
import { distanceMeters, type LatLng } from './domain/distance'
import { isFavorite } from './domain/favorites'
import { categoriesForTab, filterPlaces, filterServiceType, type CategoryTab, type PetStatusFilter, type SpaceFilter } from './domain/filters'
import { isProfileSet, matchPlace } from './domain/match'
import { regionsForCircle } from './domain/regions'
import { useManifest, useRegionPlaces } from './hooks/useDataset'
import { useFavorites } from './hooks/useFavorites'
import { useGeolocation } from './hooks/useGeolocation'
import { usePlaceRoute } from './hooks/usePlaceRoute'
import { profileSummary, useProfile } from './hooks/useProfile'
import type { SearchCandidate } from './services/kakaoSearch'

type SearchCenter = LatLng & { label: string }

export default function App() {
  const manifestState = useManifest()
  const manifest = manifestState.status === 'ready' ? manifestState.manifest : null
  const { profile, setProfile } = useProfile()
  const { geo, locate } = useGeolocation()
  const { favorites, toggle: toggleFavorite } = useFavorites()
  const { placeId, open: openDetail, close: closeDetail } = usePlaceRoute()

  const [center, setCenter] = useState<SearchCenter>({ ...DEFAULT_CENTER, label: '제주시청(기본 위치)' })
  const [fitKey, setFitKey] = useState(0) // 새 검색마다 증가 → 지도를 반경에 맞춤
  const [tab, setTab] = useState<CategoryTab>('ALL') // '전체'는 동반 장소 4종, 반려 생활은 따로 골라야 보임
  const selectedCats = useMemo(() => categoriesForTab(tab), [tab])
  const [serviceType, setServiceType] = useState('ALL') // 반려 생활 탭 안의 세부 종류(병원·약국·미용·용품)
  const [space, setSpace] = useState<SpaceFilter>('ANY')
  const [view, setView] = useState<'list' | 'map'>('list') // 목록이 기본, 지도는 버튼으로 전환
  const [radius, setRadius] = useState<SearchRadius>(DEFAULT_RADIUS)
  const [statusFilter, setStatusFilter] = useState<PetStatusFilter>('ALLOWED_ONLY')
  const [selectedId, setSelectedId] = useState<string>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [matchFilter, setMatchFilter] = useState<MatchFilterValue>('ALL')
  const [listMode, setListMode] = useState<'results' | 'favorites'>('results')
  const [courseOpen, setCourseOpen] = useState(false)

  const regionCodes = useMemo(() => (manifest ? regionsForCircle(manifest, center, radius) : []), [manifest, center, radius])
  // 반려 생활 파일은 그 카테고리를 켰거나 저장한 곳에 반려 생활 시설이 있을 때만 받는다
  const needServices = tab === 'PET_SERVICE' || favorites.some((f) => f.category === 'PET_SERVICE')
  const placesState = useRegionPlaces(manifest, regionCodes, needServices)

  const results = useMemo(
    () => (placesState.status === 'ready' ? filterPlaces(placesState.places, center, radius, selectedCats, statusFilter, space) : []),
    [placesState, center, radius, selectedCats, statusFilter, space],
  )

  // 프로필 변경은 네트워크 없이 매칭만 다시 계산한다(아키텍처 §7)
  const profileOn = isProfileSet(profile)
  const matched = useMemo(
    () => filterServiceType(results, serviceType).map((r) => ({ ...r, match: matchPlace(r.place, profile) })),
    [results, serviceType, profile],
  )
  const matchCounts = useMemo(() => {
    const counts: Record<MatchFilterValue, number> = { ALL: matched.length, MATCH: 0, NEEDS_CONFIRMATION: 0, MISMATCH: 0 }
    for (const m of matched) if (m.match) counts[m.match.status] += 1
    return counts
  }, [matched])
  const visible = useMemo(
    () => (profileOn && matchFilter !== 'ALL' ? matched.filter((m) => m.match?.status === matchFilter) : matched),
    [matched, profileOn, matchFilter],
  )
  const allPlaces = useMemo(() => (placesState.status === 'ready' ? placesState.places : []), [placesState])

  // 저장한 곳: 반경·필터와 상관없이 보여 준다. 지금 불러온 데이터에 없으면(다른 지역·데이터 갱신) 이름만 남긴다
  const favoriteItems = useMemo(
    () =>
      favorites.map((saved) => {
        const place = allPlaces.find((p) => p.id === saved.id)
        return place
          ? { saved, place, distance: distanceMeters(center, { lat: place.latitude, lng: place.longitude }), match: matchPlace(place, profile) }
          : { saved, place: undefined, distance: 0, match: null }
      }),
    [favorites, allPlaces, center, profile],
  )
  const course = useMemo(() => (courseOpen ? buildCourse(allPlaces, center, profile) : null), [courseOpen, allPlaces, center, profile])

  const visiblePlaces = useMemo(
    () => (listMode === 'favorites' ? favoriteItems.flatMap((f) => (f.place ? [f.place] : [])) : visible.map((v) => v.place)),
    [listMode, favoriteItems, visible],
  )

  // 지도 보기에서 마커로 고른 장소(아래 카드)
  const selectedPlace = useMemo(() => {
    const place = selectedId ? allPlaces.find((p) => p.id === selectedId) : undefined
    return place ? { place, distance: distanceMeters(center, { lat: place.latitude, lng: place.longitude }), match: matchPlace(place, profile) } : null
  }, [selectedId, allPlaces, center, profile])

  // 상세: 목록에 보이지 않는 장소(공유 링크)도 열 수 있도록 불러온 전체 데이터에서 찾는다
  const detailPlace = placeId && placesState.status === 'ready' ? placesState.places.find((p) => p.id === placeId) : undefined
  const detailMissing = Boolean(placeId) && placesState.status === 'ready' && !detailPlace

  const movedByUser = useRef(false) // 지역 검색·"이 지역 검색"으로 옮긴 뒤에는 자동 위치로 덮어쓰지 않는다
  const moveTo = useCallback((next: SearchCenter) => {
    setCenter(next)
    setSelectedId(undefined)
    setFitKey((k) => k + 1)
  }, [])

  const onLocate = async () => {
    movedByUser.current = false
    const pos = await locate()
    if (pos && !movedByUser.current) moveTo({ ...pos, label: '내 위치' })
  }
  const onPick = (c: SearchCandidate) => {
    movedByUser.current = true
    moveTo({ lat: c.lat, lng: c.lng, label: c.name })
  }
  const onSearchHere = useCallback(
    (c: LatLng) => {
      movedByUser.current = true
      moveTo({ ...c, label: '지도에서 선택한 지역' })
    },
    [moveTo],
  )

  // 앱을 열면 현재 위치를 자동으로 요청해 기준점으로 쓴다(AC-04-1a). 실패하면 기본 위치 + 안내
  useEffect(() => {
    let cancelled = false
    locate().then((pos) => {
      if (!cancelled && pos && !movedByUser.current) moveTo({ ...pos, label: '내 위치' })
    })
    return () => {
      cancelled = true
    }
  }, [locate, moveTo])

  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const closeCourse = useCallback(() => setCourseOpen(false), [])
  const onSelect = useCallback((id: string) => setSelectedId(id), [])

  const loadError = manifestState.status === 'error' ? manifestState.message : placesState.status === 'error' ? placesState.message : null
  const ready = manifest !== null && (placesState.status === 'ready' || regionCodes.length === 0)

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-slate-50 text-slate-900">
      <TopBar locating={geo.status === 'locating'} onLocate={onLocate} onPick={onPick} />
      <FilterBar
        tab={tab}
        onTab={(t) => {
          setTab(t)
          setServiceType('ALL')
        }}
        centerLabel={center.label}
        onLocationChip={() => document.getElementById('region-search')?.focus()}
        space={space}
        onSpace={setSpace}
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
      {geo.status === 'locating' && (
        <p className="mx-4 mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="status">
          📍 현재 위치를 확인하고 있어요. 위치 허용 창이 뜨면 &lsquo;허용&rsquo;을 눌러 주세요
        </p>
      )}
      {geo.status === 'error' && (
        <p className="mx-4 mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="status">
          📍 {geo.message}
          {geo.detail && <span className="text-sky-700/70"> ({geo.detail})</span>}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {view === 'map' ? (
          <div className="h-full">
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
            {selectedPlace && (
              // 지도에서 고른 장소는 아래쪽 카드로 보여 준다
              <ul className="absolute right-3 bottom-20 left-3 z-10" aria-label="선택한 장소">
                <PlaceCard
                  place={selectedPlace.place}
                  distance={selectedPlace.distance}
                  match={selectedPlace.match}
                  selected={false}
                  favorite={isFavorite(favorites, selectedPlace.place.id)}
                  onToggleFavorite={() => toggleFavorite(selectedPlace.place)}
                  onSelect={() => openDetail(selectedPlace.place.id)}
                />
              </ul>
            )}
          </div>
        ) : (
          <section className="h-full overflow-y-auto px-4 pt-3 pb-24" aria-label="검색 결과">
            {loadError && (
              <p role="alert" className="text-rose-700">
                {loadError}
              </p>
            )}
            {!loadError && !ready && <p role="status">불러오는 중…</p>}
            {!loadError && ready && manifest && (
              <>
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    aria-pressed={listMode === 'favorites'}
                    onClick={() => setListMode((m) => (m === 'favorites' ? 'results' : 'favorites'))}
                    className={`h-10 rounded-full px-3 text-sm font-medium ring-1 ${listMode === 'favorites' ? 'bg-amber-100 text-amber-900 ring-amber-300' : 'bg-white text-slate-700 ring-slate-200'}`}
                  >
                    ★ 저장한 곳 {favorites.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourseOpen(true)}
                    disabled={regionCodes.length === 0}
                    className="h-10 rounded-full bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"
                  >
                    🧭 코스 추천
                  </button>
                </div>
                {listMode === 'favorites' ? (
                  <>
                    <p className="mb-2 text-sm text-slate-600" aria-live="polite">
                      저장한 곳 {favorites.length}곳 · 이 기기에만 저장돼요
                    </p>
                    {favorites.length === 0 ? (
                      <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                        아직 저장한 곳이 없어요. 카드의 ♡ 나 상세 화면의 ☆ 저장을 눌러 보세요.
                      </p>
                    ) : (
                      <ul className="space-y-2" aria-label="저장한 곳">
                        {favoriteItems.map(({ saved, place, distance, match }) =>
                          place ? (
                            <PlaceCard
                              key={saved.id}
                              place={place}
                              distance={distance}
                              match={match}
                              selected={place.id === selectedId}
                              favorite
                              onToggleFavorite={() => toggleFavorite(place)}
                              onSelect={() => {
                                setSelectedId(place.id)
                                openDetail(place.id)
                              }}
                            />
                          ) : (
                            <li key={saved.id} className="flex items-center gap-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{saved.name}</span>
                                <span className="block text-xs text-slate-500">지금 불러온 지역 데이터에 없어요(다른 지역이거나 정보가 바뀌었을 수 있어요)</span>
                              </span>
                              <button type="button" onClick={() => toggleFavorite(saved)} className="h-10 shrink-0 rounded-lg bg-slate-100 px-3 text-xs">
                                저장 해제
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-slate-600" aria-live="polite">
                      <span className="font-medium text-slate-800">{center.label}</span> 기준 · {visible.length}곳 · 거리순
                    </p>
                    {profileOn && results.length > 0 && <MatchFilter value={matchFilter} counts={matchCounts} onChange={setMatchFilter} />}
                    {tab === 'STAY' && (
                      <p className="mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="note">
                        ⓘ 반려견 동반 숙소 공식 정보가 아직 적어요. 예약 전 숙소에 꼭 확인하세요.
                      </p>
                    )}
                    {tab === 'PET_SERVICE' && (
                      <div className="mb-2 flex gap-2 overflow-x-auto" role="group" aria-label="반려 생활 종류">
                        {[{ id: 'ALL', name: '전체', icon: '' }, ...serviceTypes].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            aria-pressed={serviceType === t.id}
                            onClick={() => setServiceType(t.id)}
                            className={`h-9 shrink-0 rounded-full px-3 text-sm font-medium ring-1 ${serviceType === t.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200'}`}
                          >
                            {t.icon && `${t.icon} `}
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {tab === 'PET_SERVICE' && (
                      <p className="mb-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900" role="note">
                        ⓘ 반려 생활은 동반 장소가 아니라 반려견을 위한 시설(동물병원·약국·미용·용품)이에요. 진료·영업 여부는 방문 전에 확인하세요.
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
                        이 지역은 아직 데이터가 없어요. 다른 지역을 검색해 보세요.
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
                            favorite={isFavorite(favorites, place.id)}
                            onToggleFavorite={() => toggleFavorite(place)}
                            onSelect={() => {
                              setSelectedId(place.id)
                              openDetail(place.id)
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <p className="mt-4 text-center text-xs text-slate-400">
                  자료:{' '}
                  {manifest.sources.map((src, i) => {
                    const link = sourceLink[src.source]
                    return (
                      <span key={src.source}>
                        {i > 0 && ', '}
                        {link ? (
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline">
                            {link.name}
                          </a>
                        ) : (
                          sourceLabel[src.source]
                        )}
                        ({src.fetchedAt.slice(0, 10)})
                      </span>
                    )
                  })}
                  <br />
                  정보 기준일 {manifest.generatedAt.slice(0, 10)} · 방문 전 업체에 꼭 확인하세요
                </p>
              </>
            )}
          </section>
        )}
        <button
          type="button"
          onClick={() => setView((v) => (v === 'list' ? 'map' : 'list'))}
          className="absolute bottom-5 left-1/2 z-20 h-12 -translate-x-1/2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg"
        >
          {view === 'list' ? '🗺️ 지도보기' : '☰ 목록보기'}
        </button>
      </div>

      {detailPlace && (
        <PlaceDetail
          place={detailPlace}
          distance={distanceMeters(center, { lat: detailPlace.latitude, lng: detailPlace.longitude })}
          match={matchPlace(detailPlace, profile)}
          favorite={isFavorite(favorites, detailPlace.id)}
          onToggleFavorite={() => toggleFavorite(detailPlace)}
          onClose={closeDetail}
        />
      )}

      <CourseSheet
        open={courseOpen}
        course={course}
        startLabel={center.label}
        onOpenPlace={(id) => {
          setCourseOpen(false)
          setSelectedId(id)
          openDetail(id)
        }}
        onClose={closeCourse}
      />

      <ProfileSheet open={profileOpen} profile={profile} onApply={setProfile} onClose={closeProfile} />
    </div>
  )
}
