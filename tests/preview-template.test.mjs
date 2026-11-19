import {test} from 'node:test'
import assert from 'node:assert/strict'
import {renderPreview} from '../scripts/preview-template.mjs'

const document = {
  revision: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
  banners: {
  clubhouse: [],
  loggedOut: [],
  common: [
    {
      id: 'no-image',
      title: 'No Image Banner',
      description: 'd',
      backgroundColor: null,
      imageUrl: null,
      ctaUrl: null,
      order: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'dead-cta',
      title: 'Dead CTA Banner',
      description: 'd',
      backgroundColor: '#111',
      imageUrl: 'https://sxsw.github.io/chronos-content/images/abc.png',
      ctaUrl: 'https://example.com/off-allowlist',
      order: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tied-order-a',
      title: 'Tied A',
      description: 'd',
      backgroundColor: '#222',
      imageUrl: null,
      ctaUrl: 'https://schedule.sxsw.com/a',
      order: 5,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tied-order-b',
      title: 'Tied B',
      description: 'd',
      backgroundColor: '#222',
      imageUrl: null,
      ctaUrl: 'https://schedule.sxsw.com/b',
      order: 5,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  },
  sponsors: {
    masterSponsors: [
      {
        id: 'master-sponsor',
        name: 'Master Sponsor',
        logoUrl: 'https://sxsw.github.io/chronos-content/images/logo.png',
        linkUrl: 'https://example.com',
        order: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    majorSponsors: [
      {
        id: 'logoless',
        name: 'Logoless Sponsor',
        logoUrl: null,
        linkUrl: null,
        order: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
}

test('renders the no-image badge', () => {
  const html = renderPreview(document, [])
  assert.match(html, /No Image Banner/)
  assert.match(html, /no image/)
})

test('renders the invalid-color / no-background note when backgroundColor is null', () => {
  const html = renderPreview(document, [])
  assert.match(html, /no background|invalid color/)
})

test('renders a null ctaUrl as "no CTA — not tappable"', () => {
  const html = renderPreview(document, [])
  assert.match(html, /no CTA/)
})

test('renders an off-allow-list CTA as DEAD CTA', () => {
  const html = renderPreview(document, [])
  assert.match(html, /DEAD CTA/)
})

test('renders a logo-less sponsor as dropped', () => {
  const html = renderPreview(document, [])
  assert.match(html, /Logoless Sponsor/)
  assert.match(html, /dropped/)
})

test('orders banners by (order, id)', () => {
  const html = renderPreview(document, [])
  const order = ['Dead CTA Banner', 'No Image Banner', 'Tied A', 'Tied B'].map(title => html.indexOf(title))
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i - 1] < order[i], `expected ${order} to be increasing`)
  }
})

test('shows "no warnings" when there are none', () => {
  const html = renderPreview(document, [])
  assert.match(html, /no warnings/)
})

test('shows the warnings list when there are warnings', () => {
  const html = renderPreview(document, ['something is off'])
  assert.match(html, /something is off/)
})
