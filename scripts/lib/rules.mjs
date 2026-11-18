// Shared validation rules for the dashboard content document.
// Used by both scripts/validate.mjs (fail-the-run checks) and
// scripts/preview-template.mjs (render-time badges), so the two can never
// disagree about what is wrong with a given document.

import {readFileSync, existsSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

export const ID_PATTERN = /^[a-z0-9-]+$/
export const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const HTTPS_URL_PATTERN = /^https:\/\/\S+$/i
export const ASSET_PATTERN = /^asset:(.+)$/
export const CTA_ALLOWLIST = ['https://schedule.sxsw.com']
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
export const MAX_IMAGE_BYTES = 1024 * 1024

const MAGIC_BYTES = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46], // followed by WEBP at offset 8, checked separately
}

/** `(order, id)` tiebreak, mirrored from chronos-mobile's `byOrderThenId`. */
export function byOrderThenId(a, b) {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sniffImageType(bytes) {
  if (bytes.length >= 4 && MAGIC_BYTES.png.every((byte, i) => bytes[i] === byte)) return 'png'
  if (bytes.length >= 3 && MAGIC_BYTES.jpeg.every((byte, i) => bytes[i] === byte)) return 'jpeg'
  if (
    bytes.length >= 12 &&
    MAGIC_BYTES.webp.every((byte, i) => bytes[i] === byte) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}

/**
 * Validates one `asset:<filename>` reference against `images-staging/`.
 * Returns `{ok: true, type}` or `{ok: false, error}`. Does not throw.
 */
export function checkAsset(filename, assetsDir) {
  const path = join(assetsDir, filename)
  if (!existsSync(path)) {
    return {ok: false, error: `asset "${filename}" does not exist in images-staging/`}
  }

  const bytes = readFileSync(path)
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {ok: false, error: `asset "${filename}" is ${bytes.length} bytes, over the ${MAX_IMAGE_BYTES} byte cap`}
  }

  const sniffed = sniffImageType(bytes)
  if (sniffed === null) {
    return {ok: false, error: `asset "${filename}" is not a recognizable PNG, JPEG or WebP (magic bytes did not match)`}
  }

  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext ?? '')) {
    return {ok: false, error: `asset "${filename}" has an unsupported extension (allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')})`}
  }

  return {ok: true, type: sniffed, bytes}
}

function isValidImageRef(value, assetsDir, filename, errors, fieldName) {
  if (value === null) return
  if (typeof value !== 'string') {
    errors.push(`${fieldName} must be a string or null`)
    return
  }
  const assetMatch = ASSET_PATTERN.exec(value)
  if (assetMatch) {
    const result = checkAsset(assetMatch[1], assetsDir)
    if (!result.ok) errors.push(`${filename}: ${result.error}`)
    return
  }
  if (!HTTPS_URL_PATTERN.test(value)) {
    errors.push(`${filename}: ${fieldName} must be null, "asset:<filename>", or an https:// URL`)
  }
}

function isValidUrl(value, filename, fieldName, errors) {
  if (value === null) return
  if (typeof value !== 'string' || !HTTPS_URL_PATTERN.test(value)) {
    errors.push(`${filename}: ${fieldName} must be null or an https:// URL`)
  }
}

const BANNER_FIELDS = ['id', 'title', 'description', 'backgroundColor', 'imageUrl', 'ctaUrl', 'order']
const SPONSOR_FIELDS = ['id', 'name', 'logoUrl', 'linkUrl', 'order']

function validateItem(item, index, kind, fields, assetsDir, seenIds, errors, warnings) {
  const label = `${kind}[${index}]`

  if (!isPlainObject(item)) {
    errors.push(`${label}: must be an object`)
    return null
  }

  for (const key of Object.keys(item)) {
    if (!fields.includes(key)) {
      errors.push(`${label}: unknown field "${key}"`)
    }
  }

  const id = item.id
  if (typeof id !== 'string' || id.length === 0 || !ID_PATTERN.test(id)) {
    errors.push(`${label}: id must be a non-empty string matching ${ID_PATTERN}`)
  } else if (seenIds.has(id)) {
    errors.push(`${label}: duplicate id "${id}" within ${kind}`)
  } else {
    seenIds.add(id)
  }

  const nameField = kind === 'banners' ? 'title' : 'name'
  const nameValue = item[nameField]
  if (typeof nameValue !== 'string' || nameValue.length === 0) {
    errors.push(`${label} (${id ?? '?'}): ${nameField} must be a non-empty string`)
  }

  if (kind === 'banners') {
    if (typeof item.description !== 'string') {
      errors.push(`${label} (${id ?? '?'}): description must be a string`)
    }

    if (item.backgroundColor !== null && (typeof item.backgroundColor !== 'string' || !HEX_COLOR_PATTERN.test(item.backgroundColor))) {
      errors.push(`${label} (${id ?? '?'}): backgroundColor must be null or a #rgb/#rrggbb hex string`)
    }

    isValidImageRef(item.imageUrl, assetsDir, `${label} (${id ?? '?'})`, errors, 'imageUrl')
    isValidUrl(item.ctaUrl, `${label} (${id ?? '?'})`, 'ctaUrl', errors)

    if (item.ctaUrl === null) {
      warnings.push(`${label} (${id ?? '?'}): ctaUrl is null — no tap target will render`)
    } else if (typeof item.ctaUrl === 'string' && HTTPS_URL_PATTERN.test(item.ctaUrl)) {
      const allowed = CTA_ALLOWLIST.some(prefix => item.ctaUrl.startsWith(prefix))
      if (!allowed) {
        warnings.push(`WARNING (DEAD CTA): ${label} (${id ?? '?'}): ctaUrl "${item.ctaUrl}" is outside the app's allow-list and will not open`)
      }
    }

    if (item.imageUrl === null) {
      warnings.push(`${label} (${id ?? '?'}): imageUrl is null — renders with no image`)
    }
  } else {
    isValidImageRef(item.logoUrl, assetsDir, `${label} (${id ?? '?'})`, errors, 'logoUrl')
    isValidUrl(item.linkUrl, `${label} (${id ?? '?'})`, 'linkUrl', errors)

    if (item.logoUrl === null) {
      warnings.push(`${label} (${id ?? '?'}): logoUrl is null — dropped, will not appear in the app`)
    }
  }

  if (typeof item.order !== 'number' || !Number.isFinite(item.order)) {
    errors.push(`${label} (${id ?? '?'}): order must be a finite number`)
  }

  return typeof id === 'string' ? id : null
}

/**
 * Validates a draft document. Returns `{errors, warnings}`; `errors.length === 0`
 * means the document is safe to publish. `assetsDir` is the directory `asset:`
 * references resolve against (`images-staging/` in the real repo).
 */
export function validateDocument(doc, {assetsDir}) {
  const errors = []
  const warnings = []

  if (!isPlainObject(doc)) {
    return {errors: ['document must be an object'], warnings}
  }

  for (const key of Object.keys(doc)) {
    if (key !== 'banners' && key !== 'sponsors') {
      errors.push(`unknown top-level field "${key}"`)
    }
  }
  if ('revision' in doc || 'updatedAt' in doc) {
    warnings.push('draft contains "revision" or "updatedAt" — these are stamped by publish.mjs and will be overwritten')
  }

  const banners = Array.isArray(doc.banners) ? doc.banners : null
  const sponsorsField = doc.sponsors
  const masterSponsors = isPlainObject(sponsorsField) && Array.isArray(sponsorsField.masterSponsors) ? sponsorsField.masterSponsors : null
  const majorSponsors = isPlainObject(sponsorsField) && Array.isArray(sponsorsField.majorSponsors) ? sponsorsField.majorSponsors : null
  if (banners === null) errors.push('banners must be an array')
  if (!isPlainObject(sponsorsField)) {
    errors.push('sponsors must be an object with masterSponsors and majorSponsors arrays')
  } else {
    if (masterSponsors === null) errors.push('sponsors.masterSponsors must be an array')
    if (majorSponsors === null) errors.push('sponsors.majorSponsors must be an array')
  }
  if (banners === null || masterSponsors === null || majorSponsors === null) return {errors, warnings}

  if (banners.length === 0 && masterSponsors.length === 0 && majorSponsors.length === 0) {
    warnings.push('banners and sponsors are both empty')
  }

  const bannerIds = new Set()
  banners.forEach((item, index) => validateItem(item, index, 'banners', BANNER_FIELDS, assetsDir, bannerIds, errors, warnings))

  const sponsorIds = new Set()
  masterSponsors.forEach((item, index) =>
    validateItem(item, index, 'sponsors.masterSponsors', SPONSOR_FIELDS, assetsDir, sponsorIds, errors, warnings),
  )
  majorSponsors.forEach((item, index) =>
    validateItem(item, index, 'sponsors.majorSponsors', SPONSOR_FIELDS, assetsDir, sponsorIds, errors, warnings),
  )

  if (masterSponsors.length === 0 && (masterSponsors.length + majorSponsors.length) > 0) {
    warnings.push('sponsors.masterSponsors is empty — the app will render master: null')
  } else if (masterSponsors.length > 1) {
    errors.push(`sponsors.masterSponsors must contain at most one entry (found ${masterSponsors.length})`)
  }

  const referencedAssets = new Set()
  for (const item of [...banners, ...masterSponsors, ...majorSponsors]) {
    if (!isPlainObject(item)) continue
    for (const field of ['imageUrl', 'logoUrl']) {
      const value = item[field]
      if (typeof value === 'string') {
        const match = ASSET_PATTERN.exec(value)
        if (match) referencedAssets.add(match[1])
      }
    }
  }

  if (existsSync(assetsDir)) {
    for (const filename of listImageFiles(assetsDir)) {
      if (!referencedAssets.has(filename)) {
        warnings.push(`images-staging/${filename} is not referenced by any banner or sponsor (dead upload)`)
      }
    }
  }

  return {errors, warnings}
}

function listImageFiles(dir) {
  try {
    return readdirSync(dir).filter(name => !name.startsWith('.'))
  } catch {
    return []
  }
}
