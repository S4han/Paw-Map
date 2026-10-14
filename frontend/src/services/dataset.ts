import { DATASET_BASE } from '../config/app'
import type { DatasetManifest, PetPlace, RegionFile } from '../types/place'

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

export async function loadRegion(
  manifest: DatasetManifest,
  regionCode: string,
  fetcher: Fetcher = fetch,
  base = DATASET_BASE,
): Promise<PetPlace[]> {
  const region = manifest.regions.find((r) => r.code === regionCode)
  if (!region) throw new DatasetError(`지역 ${regionCode} 데이터가 없어요`)
  const data = (await getJson(`${base}/${region.file}`, fetcher)) as RegionFile
  if (data?.regionCode !== regionCode || !Array.isArray(data.places)) {
    throw new DatasetError('지역 데이터 형식이 올바르지 않아요')
  }
  // 좌표가 없는 항목은 지도·거리 계산이 불가능하므로 제외한다(가공 단계에서 이미 걸러야 정상)
  return data.places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
}
