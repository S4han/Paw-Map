import { useCallback, useState } from 'react'
import type { LatLng } from '../domain/distance'
import { geoFailureFromCode, geoFailureMessage, type GeoFailure } from './geolocation'

const GEO_WATCHDOG_MS = 15_000

type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; position: LatLng; accuracy: number }
  | { status: 'error'; failure: GeoFailure; message: string; detail?: string }

// 앱을 열 때와 ◎ 버튼을 눌렀을 때 위치를 요청한다(요구사항 AC-04-1, AC-04-1a). 좌표는 이 기기 밖으로 보내지 않는다.
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' })

  const locate = useCallback((): Promise<LatLng | null> => {
    // detail: 브라우저가 준 오류 코드(실기기 문제를 사용자 캡처로 진단하기 위해 함께 표시)
    const fail = (failure: GeoFailure, detail?: string) => {
      setState({ status: 'error', failure, message: geoFailureMessage(failure), detail })
      return null
    }
    if (!window.isSecureContext) return Promise.resolve(fail('insecure'))
    if (!('geolocation' in navigator)) return Promise.resolve(fail('unsupported'))

    setState({ status: 'locating' })
    return new Promise((resolve) => {
      // 브라우저 timeout 은 권한 허용 뒤부터 세므로, 허용 창이 안 뜨거나 응답이 없으면 끝나지 않는다
      // (2026-10-13 실기기에서 ◎ 무반응 신고) → 따로 시간을 재서 반드시 안내로 끝낸다
      let settled = false
      const settle = (value: LatLng | null) => {
        if (settled) return
        settled = true
        clearTimeout(watchdog)
        resolve(value)
      }
      const watchdog = setTimeout(() => settle(fail('timeout', '응답 없음')), GEO_WATCHDOG_MS)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return
          const position = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setState({ status: 'ok', position, accuracy: pos.coords.accuracy })
          settle(position)
        },
        (err) => !settled && settle(fail(geoFailureFromCode(err.code), `코드 ${err.code}`)),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      )
    })
  }, [])

  return { geo: state, locate }
}
