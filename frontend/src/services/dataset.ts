import { DATASET_BASE } from '../config/app'
import type { DatasetManifest, PetPlace, RegionFile, TileFile } from '../types/place'

type Fetcher = (url: string) => Promise<Response>

export class DatasetError extends Error {}

async function getJson(url: string, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url)
  if (!res.ok) throw new DatasetError(`데이터를 불러오지 못했어요 (${res.status})`)
  return res.json()
}

export async function loadManifest(fetcher: Fetcher = fetch, base = DATASET_BASE): Promise<DatasetManifest> {
  const data = (await getJson(`${base}/manifest.json`, fetcher)) as DatasetManifest
  if (!data?.version || !Array.isArray(data.regions)) throw new DatasetError('데이터 목록 형식이 올바르지 않아요')
  return data
}

// kind 'services': 반려 생활 시설 파일(없는 지역이면 빈 목록)
export async function loadRegion(
  manifest: DatasetManifest,
  regionCode: string,
  fetcher: Fetcher = fetch,
  base = DATASET_BASE,
  kind: 'places' | 'services' = 'places',
): Promise<PetPlace[]> {
  const region = manifest.regions.find((r) => r.code === regionCode)
  if (!region) throw new DatasetError(`지역 ${regionCode} 데이터가 없어요`)
  const file = kind === 'services' ? region.servicesFile : region.file
  if (!file) return []
  const data = (await getJson(`${base}/${file}`, fetcher)) as RegionFile
  if (data?.regionCode !== regionCode || !Array.isArray(data.places)) {
    throw new DatasetError('지역 데이터 형식이 올바르지 않아요')
  }
  // 좌표가 없는 항목은 지도·거리 계산이 불가능하므로 제외한다(가공 단계에서 이미 걸러야 정상)
  return data.places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
}

// 격자 칸 파일(manifest.tiles). 그 칸에 해당 종류가 없으면 빈 목록
export async function loadTile(
  manifest: DatasetManifest,
  key: string,
  fetcher: Fetcher = fetch,
  base = DATASET_BASE,
  kind: 'places' | 'services' = 'places',
): Promise<PetPlace[]> {
  const tile = manifest.tiles?.find((t) => t.key === key)
  if (!tile) throw new DatasetError(`칸 ${key} 데이터가 없어요`)
  if ((kind === 'services' ? tile.servicesCount : tile.count) === 0) return []
  const data = (await getJson(`${base}/t/${key}${kind === 'services' ? '.s' : ''}.json`, fetcher)) as TileFile
  if (data?.tile !== key || !Array.isArray(data.places)) throw new DatasetError('칸 데이터 형식이 올바르지 않아요')
  return data.places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
}

// 데이터셋 방식에 맞춰 단위(격자 칸 키 또는 시도 코드)를 읽는다
export function loadUnit(manifest: DatasetManifest, unit: string, kind: 'places' | 'services', fetcher: Fetcher = fetch, base = DATASET_BASE) {
  return manifest.tiles ? loadTile(manifest, unit, fetcher, base, kind) : loadRegion(manifest, unit, fetcher, base, kind)
}
