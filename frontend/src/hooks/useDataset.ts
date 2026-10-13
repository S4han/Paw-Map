import { useEffect, useState } from 'react'
import { loadManifest, loadRegion } from '../services/dataset'
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

// 시도 파일은 한 번 받으면 메모리에 둔다. 필터·프로필 변경, 같은 지역 안의 재검색은 네트워크를 쓰지 않는다.
const cache = new Map<string, Promise<PetPlace[]>>()

export function useRegionPlaces(manifest: DatasetManifest | null, codes: string[]): PlacesState {
  const [state, setState] = useState<PlacesState>({ status: 'loading' })
  const key = codes.join(',')

  useEffect(() => {
    if (!manifest) return
    let cancelled = false
    const load = (code: string) => {
      const cacheKey = `${manifest.version}:${code}`
      if (!cache.has(cacheKey)) {
        const p = loadRegion(manifest, code)
        p.catch(() => cache.delete(cacheKey)) // 실패는 캐시하지 않아 재시도가 가능하게
        cache.set(cacheKey, p)
      }
      return cache.get(cacheKey)!
    }
    setState({ status: 'loading' })
    Promise.all(key ? key.split(',').map(load) : [])
      .then((lists) => !cancelled && setState({ status: 'ready', places: lists.flat() }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' }))
    return () => {
      cancelled = true
    }
  }, [manifest, key])

  return state
}
