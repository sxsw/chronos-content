import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateDocument} from '../scripts/lib/rules.mjs'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function load(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))
}

test('the shared mobile fixture validates clean (drift tripwire)', () => {
  const {errors} = validateDocument(load('content-payload.json'), {assetsDir: FIXTURES})
  assert.deepEqual(errors, [])
})

test('unknown field is an error', () => {
  const {errors} = validateDocument(load('bad-unknown-field.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('unknown field')))
})

test('duplicate id within a list is an error', () => {
  const {errors} = validateDocument(load('bad-duplicate-id.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('duplicate id')))
})

test('invalid backgroundColor is an error', () => {
  const {errors} = validateDocument(load('bad-invalid-color.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('backgroundColor')))
})

test('a missing asset reference is an error', () => {
  const {errors} = validateDocument(load('bad-missing-asset.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('does not exist')))
})

test('more than one masterSponsors entry is a hard error, not silently coerced', () => {
  const {errors} = validateDocument(load('bad-invalid-tier.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('masterSponsors must contain at most one entry')))
})

test('a non-https URL is an error', () => {
  const {errors} = validateDocument(load('bad-non-https-url.json'), {assetsDir: FIXTURES})
  assert.ok(errors.some(e => e.includes('ctaUrl')))
})

test('a draft with two errors reports both', () => {
  const doc = {
    banners: {
      clubhouse: [],
      loggedOut: [],
      common: [{id: 'b1', title: '', description: 'd', backgroundColor: 'nope', imageUrl: null, ctaUrl: null, order: 0}],
    },
    sponsors: {masterSponsors: [], majorSponsors: []},
  }
  const {errors} = validateDocument(doc, {assetsDir: FIXTURES})
  assert.ok(errors.length >= 2)
})

test('ctaUrl outside the allow-list warns DEAD CTA but does not error', () => {
  const doc = {
    banners: {
      clubhouse: [],
      loggedOut: [],
      common: [
        {
          id: 'b1',
          title: 'T',
          description: 'd',
          backgroundColor: null,
          imageUrl: null,
          ctaUrl: 'https://example.com/off-allowlist',
          order: 0,
        },
      ],
    },
    sponsors: {masterSponsors: [], majorSponsors: []},
  }
  const {errors, warnings} = validateDocument(doc, {assetsDir: FIXTURES})
  assert.deepEqual(errors, [])
  assert.ok(warnings.some(w => w.includes('DEAD CTA')))
})

test('a sponsor with no logoUrl warns that it will be dropped', () => {
  const doc = {
    banners: {clubhouse: [], loggedOut: [], common: []},
    sponsors: {masterSponsors: [], majorSponsors: [{id: 's1', name: 'N', logoUrl: null, linkUrl: null, order: 0}]},
  }
  const {warnings} = validateDocument(doc, {assetsDir: FIXTURES})
  assert.ok(warnings.some(w => w.includes('dropped')))
})

test('empty banners and sponsors both warn', () => {
  const {warnings} = validateDocument(
    {banners: {clubhouse: [], loggedOut: [], common: []}, sponsors: {masterSponsors: [], majorSponsors: []}},
    {assetsDir: FIXTURES},
  )
  assert.ok(warnings.some(w => w.includes('both empty')))
})
