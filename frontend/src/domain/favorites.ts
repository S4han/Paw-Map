import type { Category, PetPlace } from '../types/place'

// 즐겨찾기(요구사항 P2). 이 기기 브라우저에만 저장하고 서버로 보내지 않는다.
// 이름·카테고리를 함께 저장해 두어, 데이터 갱신으로 장소가 빠져도 "무엇을 저장했는지"는 보여 줄 수 있게 한다.
export type SavedPlace = { id: string; name: string; category: Category; savedAt: string }

export const MAX_FAVORITES = 200

export function isFavorite(list: readonly SavedPlace[], id: string): boolean {
  return list.some((s) => s.id === id)
}

// 있으면 빼고, 없으면 맨 앞에 넣는다(최근 저장 순)
export function toggleFavorite(list: readonly SavedPlace[], place: Pick<PetPlace, 'id' | 'name' | 'category'>, now: Date = new Date()): SavedPlace[] {
  if (isFavorite(list, place.id)) return list.filter((s) => s.id !== place.id)
  const saved: SavedPlace = { id: place.id, name: place.name, category: place.category, savedAt: now.toISOString() }
  return [saved, ...list].slice(0, MAX_FAVORITES)
}

const categories: readonly Category[] = ['RESTAURANT', 'CAFE', 'STAY', 'ATTRACTION', 'PET_SERVICE']

// 저장된 값은 사용자가 손댈 수 있으므로 모양이 맞는 항목만 받아들인다
export function parseFavorites(raw: string | null): SavedPlace[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (s): s is SavedPlace =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          typeof s.savedAt === 'string' &&
          categories.includes(s.category),
      )
      .slice(0, MAX_FAVORITES)
  } catch {
    return []
  }
}
