import { useEffect, useState } from 'react'
import { loadManifest, loadUnit } from '../services/dataset'
import type { DatasetManifest, PetPlace } from '../types/place'

type ManifestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: DatasetManifest }

export function useManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((manifest) => !cancelled && setState({ status: 'ready', manifest }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' }))
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

type PlacesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; places: PetPlace[] }

// 받는 단위: 격자 방식이면 칸 키, 예전 시도 파일 방식이면 시도 코드(manifest 로 판단).
// 받은 파일은 메모리에 둔다. 필터·프로필 변경, 같은 지역 안의 재검색은 네트워크를 쓰지 않는다.
const cache = new Map<string, Promise<PetPlace[]>>()

// includeServices: 반려 생활 카테고리를 켰을 때만 그 파일도 받는다(꺼져 있으면 네트워크를 쓰지 않음)
export function useRegionPlaces(manifest: DatasetManifest | null, codes: string[], includeServices = false): PlacesState {
  const [state, setState] = useState<PlacesState>({ status: 'loading' })
  const key = codes.join(',')

  useEffect(() => {
    if (!manifest) return
    let cancelled = false
    const load = (code: string, kind: 'places' | 'services' = 'places') => {
      const cacheKey = `${manifest.version}:${kind}:${code}`
      if (!cache.has(cacheKey)) {
        const p = loadUnit(manifest, code, kind)
        p.catch(() => cache.delete(cacheKey)) // 실패는 캐시하지 않아 재시도가 가능하게
        cache.set(cacheKey, p)
      }
      return cache.get(cacheKey)!
    }
    setState({ status: 'loading' })
    const codeList = key ? key.split(',') : []
    Promise.all([...codeList.map((c) => load(c)), ...(includeServices ? codeList.map((c) => load(c, 'services')) : [])])
      .then((lists) => !cancelled && setState({ status: 'ready', places: lists.flat() }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' }))
    return () => {
      cancelled = true
    }
  }, [manifest, key, includeServices])

  return state
}
