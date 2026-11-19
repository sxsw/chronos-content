import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {publish, PUBLIC_BASE_URL} from '../scripts/publish.mjs'

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const OTHER_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DAAAIMDAwMAFUABxUAAAAASUVORK5CYII=',
  'base64',
)

function makeAssetsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'chronos-content-assets-'))
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes)
  return dir
}

function makeOutDir() {
  return mkdtempSync(join(tmpdir(), 'chronos-content-out-'))
}

function banner(overrides = {}) {
  return {
    id: 'b1',
    title: 'T',
    description: 'd',
    backgroundColor: '#111',
    imageUrl: 'asset:a.png',
    ctaUrl: 'https://schedule.sxsw.com/x',
    order: 0,
    ...overrides,
  }
}

test('a real PNG yields the expected hashed path and URL', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES})
  const draft = {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  const {document} = publish({draft, assetsDir, previous: null, outDir: makeOutDir()})
  assert.match(document.banners.common[0].imageUrl, new RegExp(`^${PUBLIC_BASE_URL}/images/[0-9a-f]{16}\\.png$`))
})

test('identical bytes twice yield the same hashed path', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES, 'b.png': PNG_BYTES})
  const draft = {
    banners: {clubhouse: [], loggedOut: [], common: [banner({id: 'b1', imageUrl: 'asset:a.png'}), banner({id: 'b2', imageUrl: 'asset:b.png'})]},
    sponsors: {masterSponsors: [], majorSponsors: []},
  }
  const {document} = publish({draft, assetsDir, previous: null, outDir: makeOutDir()})
  assert.equal(document.banners.common[0].imageUrl, document.banners.common[1].imageUrl)
})

test('a .png-named text file is rejected', () => {
  const assetsDir = makeAssetsDir({'a.png': Buffer.from('not a real image')})
  const draft = {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  assert.throws(() => publish({draft, assetsDir, previous: null, outDir: makeOutDir()}))
})

test('a file over the 1MB cap is rejected', () => {
  const big = Buffer.concat([PNG_BYTES, Buffer.alloc(1024 * 1024)])
  const assetsDir = makeAssetsDir({'a.png': big})
  const draft = {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  assert.throws(() => publish({draft, assetsDir, previous: null, outDir: makeOutDir()}))
})

test('an unchanged item keeps its old updatedAt', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES})
  const draft = {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  const outDir = makeOutDir()

  const first = publish({draft, assetsDir, previous: null, outDir, now: '2026-01-01T00:00:00.000Z'})
  const second = publish({draft, assetsDir, previous: first.document, outDir, now: '2026-02-01T00:00:00.000Z'})

  assert.equal(second.unchanged, true)
})

test('an item whose image changed gets a new updatedAt', () => {
  const assetsDir1 = makeAssetsDir({'a.png': PNG_BYTES})
  const outDir = makeOutDir()
  const draft1 = {banners: {clubhouse: [], loggedOut: [], common: [banner({imageUrl: 'asset:a.png'})]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  const first = publish({draft: draft1, assetsDir: assetsDir1, previous: null, outDir, now: '2026-01-01T00:00:00.000Z'})

  const assetsDir2 = makeAssetsDir({'a.png': OTHER_PNG_BYTES})
  const draft2 = {banners: {clubhouse: [], loggedOut: [], common: [banner({imageUrl: 'asset:a.png'})]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  const second = publish({draft: draft2, assetsDir: assetsDir2, previous: first.document, outDir, now: '2026-02-01T00:00:00.000Z'})

  assert.notEqual(second.document.banners.common[0].imageUrl, first.document.banners.common[0].imageUrl)
  assert.equal(second.document.banners.common[0].updatedAt, '2026-02-01T00:00:00.000Z')
})

test('a new item gets this run\'s updatedAt', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES})
  const outDir = makeOutDir()
  const first = publish({draft: {banners: {clubhouse: [], loggedOut: [], common: []}, sponsors: {masterSponsors: [], majorSponsors: []}}, assetsDir, previous: null, outDir, now: '2026-01-01T00:00:00.000Z'})
  const second = publish({
    draft: {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}},
    assetsDir,
    previous: first.document,
    outDir,
    now: '2026-02-01T00:00:00.000Z',
  })
  assert.equal(second.document.banners.common[0].updatedAt, '2026-02-01T00:00:00.000Z')
})

test('running twice with no draft change is a no-op (idempotence)', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES})
  const outDir = makeOutDir()
  const draft = {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}
  const first = publish({draft, assetsDir, previous: null, outDir, now: '2026-01-01T00:00:00.000Z'})
  assert.equal(first.unchanged, false)
  assert.equal(first.document.revision, 1)

  const second = publish({draft, assetsDir, previous: first.document, outDir, now: '2026-03-01T00:00:00.000Z'})
  assert.equal(second.unchanged, true)
})

test('revision increments on an actual change', () => {
  const assetsDir = makeAssetsDir({'a.png': PNG_BYTES})
  const outDir = makeOutDir()
  const first = publish({draft: {banners: {clubhouse: [], loggedOut: [], common: [banner()]}, sponsors: {masterSponsors: [], majorSponsors: []}}, assetsDir, previous: null, outDir, now: '2026-01-01T00:00:00.000Z'})
  const second = publish({
    draft: {banners: {clubhouse: [], loggedOut: [], common: [banner({title: 'Changed'})]}, sponsors: {masterSponsors: [], majorSponsors: []}},
    assetsDir,
    previous: first.document,
    outDir,
    now: '2026-02-01T00:00:00.000Z',
  })
  assert.equal(second.document.revision, 2)
})
