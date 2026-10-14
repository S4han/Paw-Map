import { useEffect, useRef, useState } from 'react'
import { KAKAO_JS_KEY } from '../config/app'
import type { LatLng } from '../domain/distance'
import { shouldOfferSearchHere } from '../domain/searchHere'
import { loadKakaoMaps } from '../services/kakao'
import type { PetPlace } from '../types/place'

type Props = {
  searchCenter: LatLng // 검색 기준점
  myLocation?: LatLng // GPS 위치(있을 때만 파란 점)
  radius: number
  places: PetPlace[]
  selectedId?: string
  fitKey: string // 바뀔 때마다 지도를 검색 반경에 맞춘다(새 검색·반경 변경)
  onSelect: (id: string) => void
  onSearchHere: (center: LatLng) => void
}

const M_PER_DEG_LAT = 111_320

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function dot(color: string, label: string): string {
  return `<div role="img" aria-label="${label}" style="width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>`
}

// 지도·마커. 키가 없거나 SDK 로드에 실패하면 안내만 표시하고 목록은 그대로 쓴다(아키텍처 §8).
export function MapView({ searchCenter, myLocation, radius, places, selectedId, fitKey, onSelect, onSearchHere }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [error, setError] = useState<string | null>(KAKAO_JS_KEY ? null : '카카오 지도 키가 없어 목록으로 보여드려요')
  const [offerSearchHere, setOfferSearchHere] = useState(false)

  const clustererRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const circleRef = useRef<any>(null)
  const centerDotRef = useRef<any>(null)
  const myDotRef = useRef<any>(null)
  const labelRef = useRef<any>(null)
  const mapCenterRef = useRef<LatLng>(searchCenter)
  // idle 이벤트 핸들러는 한 번만 등록하므로 최신 값은 ref 로 읽는다
  const latest = useRef({ searchCenter, radius, onSelect })
  latest.current = { searchCenter, radius, onSelect }

  // 지도 생성(한 번)
  useEffect(() => {
    if (!KAKAO_JS_KEY) return
    let cancelled = false
    loadKakaoMaps(KAKAO_JS_KEY)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        const m = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(searchCenter.lat, searchCenter.lng),
          level: 6,
        })
        kakao.maps.event.addListener(m, 'idle', () => {
          const c = m.getCenter()
          const center = { lat: c.getLat(), lng: c.getLng() }
          mapCenterRef.current = center
          setOfferSearchHere(shouldOfferSearchHere(latest.current.searchCenter, center, latest.current.radius))
        })
        clustererRef.current = kakao.maps.MarkerClusterer
          ? new kakao.maps.MarkerClusterer({
              map: m,
              averageCenter: true,
              minLevel: 6,
              gridSize: 60,
              // 기본 파란 묶음은 기준점과 겹치면 숫자가 가려져 주황 원·흰 숫자로 바꾼다
              styles: [
                {
                  width: '40px',
                  height: '40px',
                  background: 'rgba(234, 88, 12, 0.9)',
                  border: '2px solid #fff',
                  borderRadius: '9999px',
                  color: '#fff',
                  textAlign: 'center',
                  fontWeight: '700',
                  lineHeight: '36px',
                  boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                },
              ],
            })
          : null
        setMap(m)
      })
      .catch((e: Error) => !cancelled && setError(`${e.message}. 목록으로 보여드려요`))
    return () => {
      cancelled = true
    }
    // 지도는 한 번만 만든다. 이후 이동은 아래 효과들이 담당
  }, [])

  // 지도 영역 크기가 바뀌면(iOS Safari 주소창 접힘으로 dvh 변경, 화면 회전 등) 카카오 지도는 relayout() 전까지
  // 위치·타일을 어긋나게 그린다(2026-10-13 iPhone 실기기에서 남쪽 바다·빈 타일로 표시됨). 중심을 지키며 다시 맞춘다.
  useEffect(() => {
    const el = containerRef.current
    if (!map || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const c = map.getCenter()
      map.relayout()
      map.setCenter(c)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  // 검색 반경 원 + 기준점 + 지도 범위 맞추기
  useEffect(() => {
    const kakao = window.kakao
    if (!kakao || !map) return
    const center = new kakao.maps.LatLng(searchCenter.lat, searchCenter.lng)
    circleRef.current?.setMap(null)
    circleRef.current = new kakao.maps.Circle({
      map,
      center,
      radius,
      strokeWeight: 2,
      strokeColor: '#f97316',
      strokeOpacity: 0.8,
      fillColor: '#f97316',
      fillOpacity: 0.06,
    })
    centerDotRef.current?.setMap(null)
    centerDotRef.current = new kakao.maps.CustomOverlay({ map, position: center, content: dot('#334155', '검색 기준점'), zIndex: 0 })

    // 반경 원에 맞추면 지도 중심 = 기준점이 되어 "이 지역 검색" 판단 기준이 단순해진다
    const dLat = radius / M_PER_DEG_LAT
    const dLng = radius / (M_PER_DEG_LAT * Math.cos((searchCenter.lat * Math.PI) / 180))
    map.setBounds(
      new kakao.maps.LatLngBounds(
        new kakao.maps.LatLng(searchCenter.lat - dLat, searchCenter.lng - dLng),
        new kakao.maps.LatLng(searchCenter.lat + dLat, searchCenter.lng + dLng),
      ),
    )
    setOfferSearchHere(false)
  }, [map, fitKey, searchCenter.lat, searchCenter.lng, radius])

  // 내 위치(GPS) 파란 점
  useEffect(() => {
    const kakao = window.kakao
    if (!kakao || !map) return
    myDotRef.current?.setMap(null)
    myDotRef.current = myLocation
      ? new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(myLocation.lat, myLocation.lng), content: dot('#2563eb', '내 위치'), zIndex: 1 })
      : null
  }, [map, myLocation])

  // 장소 마커(겹치면 묶음 표시)
  useEffect(() => {
    const kakao = window.kakao
    if (!kakao || !map) return
    const clusterer = clustererRef.current
    clusterer?.clear()
    markersRef.current.forEach((mk) => mk.setMap(null))
    markersRef.current = new Map(
      places.map((p) => {
        const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(p.latitude, p.longitude), title: p.name })
        kakao.maps.event.addListener(marker, 'click', () => latest.current.onSelect(p.id))
        return [p.id, marker]
      }),
    )
    const all = [...markersRef.current.values()]
    if (clusterer) clusterer.addMarkers(all)
    else all.forEach((mk) => mk.setMap(map))
  }, [map, places])

  // 선택된 장소: 이름 표시 + 화면 밖이면 그쪽으로 이동
  useEffect(() => {
    const kakao = window.kakao
    if (!kakao || !map) return
    labelRef.current?.setMap(null)
    labelRef.current = null
    const p = places.find((x) => x.id === selectedId)
    if (!p) return
    const pos = new kakao.maps.LatLng(p.latitude, p.longitude)
    labelRef.current = new kakao.maps.CustomOverlay({
      map,
      position: pos,
      yAnchor: 2.6,
      zIndex: 10,
      content: `<div style="padding:4px 8px;border-radius:9999px;background:#f97316;color:#fff;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">${escapeHtml(p.name)}</div>`,
    })
    if (!map.getBounds().contain(pos)) map.panTo(pos)
  }, [map, places, selectedId])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-500" role="status">
        🗺️ {error}
      </div>
    )
  }
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="지도" />
      {offerSearchHere && (
        <button
          type="button"
          onClick={() => onSearchHere(mapCenterRef.current)}
          className="absolute top-3 left-1/2 z-10 h-11 -translate-x-1/2 rounded-full bg-white px-4 text-sm font-semibold text-orange-600 shadow-md ring-1 ring-orange-200"
        >
          ↻ 이 지역 검색
        </button>
      )}
    </div>
  )
}
