#!/usr/bin/env node
// Builds the published artifact from the draft content.json: resolves asset:
// references to content-hashed images, stamps revision/updatedAt, renders
// index.html. Run after validate.mjs has passed.

import {createHash} from 'node:crypto'
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, isAbsolute, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ASSET_PATTERN, byOrderThenId, checkAsset} from './lib/rules.mjs'
import {renderPreview} from './preview-template.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// raw.githubusercontent.com needs no GitHub Pages setup/admin access (unlike
// sxsw.github.io, which requires repo-settings permission we don't have) —
// it serves any file from any branch of a public repo directly.
export const PUBLIC_BASE_URL = 'https://raw.githubusercontent.com/sxsw/chronos-content/gh-pages'

const BANNER_FIELDS = ['id', 'title', 'description', 'backgroundColor', 'imageUrl', 'ctaUrl', 'order']
const SPONSOR_FIELDS = ['id', 'name', 'logoUrl', 'linkUrl', 'order']

function pick(obj, fields) {
  const result = {}
  for (const field of fields) result[field] = obj[field]
  return result
}

/** Resolves one `imageUrl`/`logoUrl` value to its final public URL, hashing and copying the asset if needed. */
function resolveImageRef(value, assetsDir, outImagesDir, warnings) {
  if (value === null) return null
  const match = ASSET_PATTERN.exec(value)
  if (!match) return value // already a plain https:// URL, passed through untouched

  const filename = match[1]
  const result = checkAsset(filename, assetsDir)
  if (!result.ok) {
    // validate.mjs should have already failed the run on this; defensive only.
    throw new Error(result.error)
  }

  const hash = createHash('sha256').update(result.bytes).digest('hex').slice(0, 16)
  const ext = result.type === 'jpeg' ? 'jpg' : result.type
  const hashedName = `${hash}.${ext}`

  mkdirSync(outImagesDir, {recursive: true})
  const destPath = join(outImagesDir, hashedName)
  if (!existsSync(destPath)) {
    copyFileSync(join(assetsDir, filename), destPath)
  }

  return `${PUBLIC_BASE_URL}/images/${hashedName}`
}

function withoutUpdatedAt(item) {
  const {updatedAt, ...rest} = item
  return rest
}

function stableStringify(item, fields) {
  return JSON.stringify(pick(item, fields))
}

/**
 * Stamps each item's `updatedAt`: an unchanged item (comparing every field but
 * `updatedAt`) keeps its previous timestamp; a new or changed item gets `now`.
 * This is the cache-busting contract `buildImageSource` depends on
 * (content-image.ts) — get it wrong and either every publish re-downloads
 * every image, or a replaced image never appears.
 */
function stampUpdatedAt(items, previousItems, fields, now) {
  const previousById = new Map(previousItems.map(item => [item.id, item]))
  return items.map(item => {
    const previous = previousById.get(item.id)
    if (previous && stableStringify(withoutUpdatedAt(previous), fields) === stableStringify(item, fields)) {
      return {...item, updatedAt: previous.updatedAt ?? now}
    }
    return {...item, updatedAt: now}
  })
}

function serialize(doc) {
  const banners = doc.banners.map(item => pick(item, [...BANNER_FIELDS, 'updatedAt']))
  const masterSponsors = doc.sponsors.masterSponsors.map(item => pick(item, [...SPONSOR_FIELDS, 'updatedAt']))
  const majorSponsors = doc.sponsors.majorSponsors.map(item => pick(item, [...SPONSOR_FIELDS, 'updatedAt']))
  return {
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    banners: [...banners].sort(byOrderThenId),
    sponsors: {
      masterSponsors: [...masterSponsors].sort(byOrderThenId),
      majorSponsors: [...majorSponsors].sort(byOrderThenId),
    },
  }
}

function withoutRevisionMetadata(doc) {
  const {revision, updatedAt, ...rest} = serialize(doc)
  void revision
  void updatedAt
  return rest
}

export function publish({
  draft,
  assetsDir,
  previous,
  outDir,
  now = new Date().toISOString(),
  warnings = [],
} = {}) {
  const outImagesDir = join(outDir, 'images')

  const rewrittenBanners = draft.banners.map(banner => ({
    ...pick(banner, BANNER_FIELDS),
    imageUrl: resolveImageRef(banner.imageUrl, assetsDir, outImagesDir, warnings),
  }))
  const rewriteSponsor = sponsor => ({
    ...pick(sponsor, SPONSOR_FIELDS),
    logoUrl: resolveImageRef(sponsor.logoUrl, assetsDir, outImagesDir, warnings),
  })
  const rewrittenMasterSponsors = draft.sponsors.masterSponsors.map(rewriteSponsor)
  const rewrittenMajorSponsors = draft.sponsors.majorSponsors.map(rewriteSponsor)

  const previousBanners = previous?.banners ?? []
  const previousMasterSponsors = previous?.sponsors?.masterSponsors ?? []
  const previousMajorSponsors = previous?.sponsors?.majorSponsors ?? []

  const stampedBanners = stampUpdatedAt(rewrittenBanners, previousBanners, BANNER_FIELDS, now)
  const stampedMasterSponsors = stampUpdatedAt(rewrittenMasterSponsors, previousMasterSponsors, SPONSOR_FIELDS, now)
  const stampedMajorSponsors = stampUpdatedAt(rewrittenMajorSponsors, previousMajorSponsors, SPONSOR_FIELDS, now)
  const stampedSponsors = {masterSponsors: stampedMasterSponsors, majorSponsors: stampedMajorSponsors}

  const candidate = {revision: 0, updatedAt: now, banners: stampedBanners, sponsors: stampedSponsors}
  const previousForCompare = {
    revision: 0,
    updatedAt: now,
    banners: previousBanners,
    sponsors: {masterSponsors: previousMasterSponsors, majorSponsors: previousMajorSponsors},
  }
  const unchanged = previous != null && JSON.stringify(withoutRevisionMetadata(candidate)) === JSON.stringify(withoutRevisionMetadata(previousForCompare))

  if (unchanged) {
    return {unchanged: true, document: previous}
  }

  const revision = (previous?.revision ?? 0) + 1
  const document = serialize({revision, updatedAt: now, banners: stampedBanners, sponsors: stampedSponsors})

  return {unchanged: false, document}
}

export function writeArtifact(outDir, document, warnings) {
  mkdirSync(outDir, {recursive: true})
  mkdirSync(join(outDir, 'images'), {recursive: true})
  writeFileSync(join(outDir, 'content.json'), `${JSON.stringify(document, null, 2)}\n`)
  writeFileSync(join(outDir, '.nojekyll'), '')
  writeFileSync(join(outDir, 'index.html'), renderPreview(document, warnings))
}

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out')
  return {out: outIndex === -1 ? 'published' : argv[outIndex + 1]}
}

function main() {
  const {out} = parseArgs(process.argv.slice(2))
  const outDir = isAbsolute(out) ? out : join(REPO_ROOT, out)

  const draft = JSON.parse(readFileSync(join(REPO_ROOT, 'content.json'), 'utf8'))
  const previousPath = join(outDir, 'content.json')
  const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf8')) : null

  const warnings = []
  const result = publish({draft, assetsDir: join(REPO_ROOT, 'images-staging'), previous, outDir, warnings})

  if (result.unchanged) {
    console.log('nothing to publish')
    return
  }

  writeArtifact(outDir, result.document, warnings)
  console.log(`published revision ${result.document.revision}`)

  const githubEnv = process.env.GITHUB_ENV
  if (githubEnv) {
    writeFileSync(githubEnv, `REVISION=${result.document.revision}\n`, {flag: 'a'})
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
