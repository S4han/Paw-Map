import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DatasetError, loadManifest, loadRegion, loadTile, loadUnit } from './dataset'

// 격자 방식(배포용) public/data/mock 과 그 원본인 시도 파일 방식 mock-src 를 fetch 대신 읽어 준다
const fileFetcher = (dir: string) => async (url: string) => {
  const name = url.replace(/^\/data\/(mock|src)\//, '')
  try {
    return new Response(readFileSync(fileURLToPath(new URL(name, new URL(dir, import.meta.url))), 'utf-8'), { status: 200 })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
const tiled = fileFetcher('../../public/data/mock/')
const regional = fileFetcher('../../mock-src/')

describe('dataset (격자 방식)', () => {
  it('칸 파일을 읽는다', async () => {
    const manifest = await loadManifest(tiled, '/data/mock')
    expect(manifest.isMock).toBe(true)
    expect(manifest.tiles?.length).toBeGreaterThan(0)
    const all = (await Promise.all(manifest.tiles!.map((t) => loadTile(manifest, t.key, tiled, '/data/mock')))).flat()
    expect(all.length).toBe(manifest.regions[0].count)
    expect(all.every((p) => p.name.startsWith('(가상)') && p.category !== 'PET_SERVICE')).toBe(true)
    const services = (await Promise.all(manifest.tiles!.map((t) => loadUnit(manifest, t.key, 'services', tiled, '/data/mock')))).flat()
    expect(services.length).toBe(manifest.regions[0].servicesCount)
    expect(services.every((p) => p.category === 'PET_SERVICE')).toBe(true)
  })

  it('없는 칸은 오류, 건수 0인 종류는 빈 목록', async () => {
    const manifest = await loadManifest(tiled, '/data/mock')
    await expect(loadTile(manifest, '999_999', tiled, '/data/mock')).rejects.toBeInstanceOf(DatasetError)
    const noServices = { ...manifest, tiles: manifest.tiles!.map((t) => ({ ...t, servicesCount: 0 })) }
    expect(await loadTile(noServices, manifest.tiles![0].key, tiled, '/data/mock', 'services')).toEqual([])
  })
})

describe('dataset (예전 시도 파일 방식 — 전환 기간 호환)', () => {
  it('시도 파일과 반려 생활 파일을 읽는다', async () => {
    const manifest = await loadManifest(regional, '/data/src')
    const places = await loadUnit(manifest, '50', 'places', regional, '/data/src')
    expect(places.length).toBe(manifest.regions[0].count)
    const services = await loadRegion(manifest, '50', regional, '/data/src', 'services')
    expect(services.length).toBe(manifest.regions[0].servicesCount)
    await expect(loadRegion(manifest, '11', regional, '/data/src')).rejects.toBeInstanceOf(DatasetError)
  })

  it('HTTP 오류는 DatasetError', async () => {
    const failing = async () => new Response('', { status: 503 })
    await expect(loadManifest(failing, '/x')).rejects.toBeInstanceOf(DatasetError)
  })
})
