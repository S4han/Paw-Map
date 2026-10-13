import { useEffect, useState } from 'react'
import { loadManifest, loadRegion } from '../services/dataset'
import type { DatasetManifest, PetPlace } from '../types/place'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: DatasetManifest; places: PetPlace[] }

export function useDataset(regionCode: string): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loadManifest()
      .then(async (manifest) => ({ manifest, places: await loadRegion(manifest, regionCode) }))
      .then(({ manifest, places }) => !cancelled && setState({ status: 'ready', manifest, places }))
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' })
      })
    return () => {
      cancelled = true
    }
  }, [regionCode])

  return state
}
