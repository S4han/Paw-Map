import { useCallback, useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { MapView } from './components/MapView'
import { PlaceCard } from './components/PlaceCard'
import { ProfileSheet } from './components/ProfileSheet'
import { TopBar } from './components/TopBar'
import { categories, DEFAULT_CENTER, DEFAULT_RADIUS, DEFAULT_REGION_CODE, type SearchRadius } from './config/app'
import { filterPlaces, type PetStatusFilter } from './domain/filters'
import { useDataset } from './hooks/useDataset'
import { isProfileEmpty, profileSummary, useProfile } from './hooks/useProfile'
import type { Category } from './types/place'

export default function App() {
  const dataset = useDataset(DEFAULT_REGION_CODE)
  const { profile, setProfile } = useProfile()
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(() => new Set(categories.map((c) => c.id)))
  const [radius, setRadius] = useState<SearchRadius>(DEFAULT_RADIUS)
  const [statusFilter, setStatusFilter] = useState<PetStatusFilter>('ALLOWED_ONLY')
  const [selectedId, setSelectedId] = useState<string>()
  const [profileOpen, setProfileOpen] = useState(false)
  // 기준점: STEP 5에서 GPS·지역 검색·"이 지역 검색"으로 바뀐다
  const center = DEFAULT_CENTER

  const results = useMemo(
    () => (dataset.status === 'ready' ? filterPlaces(dataset.places, center, radius, selectedCats, statusFilter) : []),
    [dataset, center, radius, selectedCats, statusFilter],
  )

  const toggleCategory = (c: Category) =>
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const onSelect = useCallback((id: string) => setSelectedId(id), [])

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-slate-50 text-slate-900">
      <TopBar />
      <FilterBar
        selected={selectedCats}
        onToggleCategory={toggleCategory}
        radius={radius}
        onRadius={setRadius}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        profileText={profileSummary(profile)}
        profileActive={!isProfileEmpty(profile)}
        onOpenProfile={() => setProfileOpen(true)}
      />

      {dataset.status === 'ready' && dataset.manifest.isMock && (
        <p className="mx-4 mb-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs text-amber-900" role="note">
          🧪 가상(Mock) 데이터로 보여주는 개발용 화면이에요. 실제 장소가 아닙니다.
        </p>
      )}

      <div className="h-[38dvh] shrink-0">
        <MapView center={center} places={results.map((r) => r.place)} selectedId={selectedId} onSelect={onSelect} />
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6" aria-label="검색 결과">
        {dataset.status === 'loading' && <p role="status">불러오는 중…</p>}
        {dataset.status === 'error' && (
          <p role="alert" className="text-rose-700">
            {dataset.message}
          </p>
        )}
        {dataset.status === 'ready' && (
          <>
            <p className="mb-2 text-sm text-slate-600" aria-live="polite">
              {results.length}곳 · 거리순
            </p>
            {results.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                반경 안에 조건에 맞는 장소가 없어요. 반경을 넓히거나 "미확인 포함"을 선택해 보세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {results.map(({ place, distance }) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    distance={distance}
                    selected={place.id === selectedId}
                    onSelect={() => setSelectedId(place.id)}
                  />
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">
              정보 기준일 {dataset.manifest.generatedAt.slice(0, 10)} · 방문 전 업체에 꼭 확인하세요
            </p>
          </>
        )}
      </section>

      <ProfileSheet open={profileOpen} profile={profile} onApply={setProfile} onClose={closeProfile} />
    </div>
  )
}
