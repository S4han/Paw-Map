import { useCallback, useState } from 'react'
import { parseFavorites, toggleFavorite, type SavedPlace } from '../domain/favorites'
import type { PetPlace } from '../types/place'

// 즐겨찾기는 이 기기 브라우저에만 저장한다(useProfile 과 같은 방식). 저장이 막힌 환경에서도 세션 동안은 동작.
const STORAGE_KEY = 'pawmap.favorites.v1'

function read(): SavedPlace[] {
  try {
    return parseFavorites(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedPlace[]>(read)

  const toggle = useCallback((place: Pick<PetPlace, 'id' | 'name' | 'category'>) => {
    setFavorites((prev) => {
      const next = toggleFavorite(prev, place)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // 사생활 보호 모드 등: 저장만 건너뛴다
      }
      return next
    })
  }, [])

  return { favorites, toggle }
}
