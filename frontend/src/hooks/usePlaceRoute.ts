import { useCallback, useEffect, useRef, useState } from 'react'

// 상세 화면 주소: #/place/{id}. 해시를 쓰면 정적 호스팅에서도 새로고침·공유·뒤로가기가 동작한다(서버 없음, 안 A).
const PREFIX = '#/place/'

function readHash(): string | null {
  const h = window.location.hash
  return h.startsWith(PREFIX) ? decodeURIComponent(h.slice(PREFIX.length)) : null
}

export function usePlaceRoute() {
  const [placeId, setPlaceId] = useState<string | null>(readHash)
  // 앱 안에서 연 상세만 뒤로가기로 닫는다. 공유 링크로 바로 들어온 경우 뒤로가기는 사이트를 떠나므로 해시만 지운다.
  const openedInApp = useRef(false)

  useEffect(() => {
    const onChange = () => {
      const id = readHash()
      if (!id) openedInApp.current = false
      setPlaceId(id)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const open = useCallback((id: string) => {
    openedInApp.current = true
    window.location.hash = `${PREFIX}${encodeURIComponent(id)}`
  }, [])

  const close = useCallback(() => {
    if (openedInApp.current) {
      window.history.back() // hashchange 가 상태를 정리한다
      return
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setPlaceId(null)
  }, [])

  return { placeId, open, close }
}
