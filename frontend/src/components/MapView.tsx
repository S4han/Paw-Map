import { useEffect, useRef, useState } from 'react'
import { KAKAO_JS_KEY } from '../config/app'
import type { LatLng } from '../domain/distance'
import { loadKakaoMaps } from '../services/kakao'
import type { PetPlace } from '../types/place'

type Props = {
  center: LatLng
  places: PetPlace[]
  selectedId?: string
  onSelect: (id: string) => void
}

// 지도 + 장소 마커. 키가 없거나 SDK 로드에 실패하면 안내만 표시하고 목록은 그대로 쓴다(아키텍처 §8).
// 마커 묶음·"이 지역 검색"·지도 중심 이동은 STEP 5에서 구현한다.
export function MapView({ center, places, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<any[]>([])
  const [map, setMap] = useState<any>(null)
  const [error, setError] = useState<string | null>(KAKAO_JS_KEY ? null : '카카오 지도 키가 없어 목록으로 보여드려요')

  useEffect(() => {
    if (!KAKAO_JS_KEY) return
    let cancelled = false
    loadKakaoMaps(KAKAO_JS_KEY)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        setMap(
          new kakao.maps.Map(containerRef.current, {
            center: new kakao.maps.LatLng(center.lat, center.lng),
            level: 6,
          }),
        )
      })
      .catch((e: Error) => !cancelled && setError(`${e.message}. 목록으로 보여드려요`))
    return () => {
      cancelled = true
    }
    // 지도는 한 번만 만든다. 중심 이동은 STEP 5
  }, [])

  useEffect(() => {
    const kakao = window.kakao
    if (!kakao || !map) return
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = places.map((p) => {
      const marker = new kakao.maps.Marker({
        map,
        position: new kakao.maps.LatLng(p.latitude, p.longitude),
        title: p.name,
        zIndex: p.id === selectedId ? 10 : 1,
      })
      kakao.maps.event.addListener(marker, 'click', () => onSelect(p.id))
      return marker
    })
  }, [map, places, selectedId, onSelect])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-500" role="status">
        🗺️ {error}
      </div>
    )
  }
  return <div ref={containerRef} className="h-full w-full" aria-label="지도" />
}
