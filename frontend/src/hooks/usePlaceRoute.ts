import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '../domain/distance'
import { parsePlaceHash, placeHash, type PlaceRoute } from './placeHash'

const readHash = () => parsePlaceHash(window.location.hash)

export function usePlaceRoute() {
  const [route, setRoute] = useState<PlaceRoute | null>(readHash)
  // 앱 안에서 연 상세만 뒤로가기로 닫는다. 공유 링크로 바로 들어온 경우 뒤로가기는 사이트를 떠나므로 해시만 지운다.
  const openedInApp = useRef(false)

  useEffect(() => {
    const onChange = () => {
      const next = readHash()
      if (!next) openedInApp.current = false
      setRoute(next)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const open = useCallback((id: string, at?: LatLng) => {
    openedInApp.current = true
    window.location.hash = placeHash(id, at)
  }, [])

  const close = useCallback(() => {
    if (openedInApp.current) {
      window.history.back() // hashchange 가 상태를 정리한다
      return
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setRoute(null)
  }, [])

  return { placeId: route?.id ?? null, placeAt: route?.at, open, close }
}
