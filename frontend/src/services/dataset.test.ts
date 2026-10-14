import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DatasetError, loadManifest, loadRegion } from './dataset'

const mockDir = new URL('../../public/data/mock/', import.meta.url)

// public/data/mock 의 실제 파일을 fetch 대신 읽어 준다
const fileFetcher = async (url: string) => {
  const name = url.split('/').pop()!
  try {
    return new Response(readFileSync(fileURLToPath(new URL(name, mockDir)), 'utf-8'), { status: 200 })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

describe('dataset', () => {
  it('Mock 데이터셋을 읽는다', async () => {
    const manifest = await loadManifest(fileFetcher, '/data/mock')
    expect(manifest.isMock).toBe(true)
    const places = await loadRegion(manifest, '50', fileFetcher, '/data/mock')
    expect(places.length).toBe(manifest.regions[0].count)
    expect(places.every((p) => p.name.startsWith('(가상)'))).toBe(true)
  })

  it('반려 생활 파일은 따로 읽고, 없는 지역은 빈 목록', async () => {
    const manifest = await loadManifest(fileFetcher, '/data/mock')
    const services = await loadRegion(manifest, '50', fileFetcher, '/data/mock', 'services')
    expect(services.length).toBe(manifest.regions[0].servicesCount)
    expect(services.every((p) => p.category === 'PET_SERVICE' && Boolean(p.subcategory))).toBe(true)
    const noServices = { ...manifest, regions: [{ ...manifest.regions[0], servicesFile: undefined }] }
    expect(await loadRegion(noServices, '50', fileFetcher, '/data/mock', 'services')).toEqual([])
  })

  it('없는 지역은 오류', async () => {
    const manifest = await loadManifest(fileFetcher, '/data/mock')
    await expect(loadRegion(manifest, '11', fileFetcher, '/data/mock')).rejects.toBeInstanceOf(DatasetError)
  })

  it('HTTP 오류는 DatasetError', async () => {
    const failing = async () => new Response('', { status: 503 })
    await expect(loadManifest(failing, '/x')).rejects.toBeInstanceOf(DatasetError)
  })
})
