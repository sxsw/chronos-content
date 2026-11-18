// Renders the published document to a static preview page: what you see
// here is what the phones get, including the behavior badges for the
// pathological cases the validator only warns about.

import {byOrderThenId, CTA_ALLOWLIST, HTTPS_URL_PATTERN} from './lib/rules.mjs'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function isAllowedCta(url) {
  return typeof url === 'string' && HTTPS_URL_PATTERN.test(url) && CTA_ALLOWLIST.some(prefix => url.startsWith(prefix))
}

function bannerCard(banner) {
  const badges = []
  let imageHtml = '<div class="no-image">no image</div>'
  if (banner.imageUrl !== null) {
    imageHtml = `<img src="${escapeHtml(banner.imageUrl)}" alt="" class="banner-image" />`
  } else {
    badges.push('<span class="badge">no image</span>')
  }

  let ctaHtml = ''
  if (banner.ctaUrl === null) {
    badges.push('<span class="badge badge-warn">no CTA — not tappable</span>')
  } else if (!isAllowedCta(banner.ctaUrl)) {
    badges.push('<span class="badge badge-dead">DEAD CTA — outside the app&#39;s allow-list, will not open</span>')
    ctaHtml = '<span class="chevron chevron-dead">&rsaquo;</span>'
  } else {
    ctaHtml = '<span class="chevron">&rsaquo;</span>'
  }

  const background = banner.backgroundColor ?? 'transparent'
  const colorBadge = banner.backgroundColor === null ? '<span class="badge">invalid color — renders with no background</span>' : ''

  return `
    <div class="banner-card" style="background-color: ${escapeHtml(background)}">
      ${imageHtml}
      <div class="banner-body">
        <div class="banner-title">${escapeHtml(banner.title)}</div>
        <div class="banner-description">${escapeHtml(banner.description)}</div>
      </div>
      ${ctaHtml}
      <div class="badges">${badges.join('')}${colorBadge}</div>
    </div>`
}

function sponsorRow(sponsor, dropped) {
  const classes = dropped ? 'sponsor dropped' : 'sponsor'
  const badge = dropped ? '<span class="badge badge-warn">dropped — will not appear in the app</span>' : ''
  return `<div class="${classes}">${escapeHtml(sponsor.name)}${badge}</div>`
}

export function renderPreview(document, warnings = []) {
  const banners = [...document.banners].sort(byOrderThenId)

  // Defensive, belt-and-braces: masterSponsors.length > 1 is a hard validation
  // error, but this still picks by (order, id) and demotes the rest to major
  // for display, mirroring the mobile app's own defensive posture.
  const taggedMaster = document.sponsors.masterSponsors.map(s => ({...s, isMaster: true}))
  const taggedMajor = document.sponsors.majorSponsors.map(s => ({...s, isMaster: false}))
  const sortedAll = [...taggedMaster, ...taggedMajor].sort(byOrderThenId)
  const sortedValid = sortedAll.filter(s => s.logoUrl !== null)

  const masterIndex = sortedValid.findIndex(s => s.isMaster)
  const master = masterIndex === -1 ? null : sortedValid[masterIndex]
  const major = sortedValid.filter((_, index) => index !== masterIndex)
  const droppedSponsors = sortedAll.filter(s => s.logoUrl === null)
  const sponsors = sortedAll

  const warningsHtml =
    warnings.length === 0
      ? '<p class="no-warnings">no warnings</p>'
      : `<ul class="warnings">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Chronos content preview — revision ${document.revision}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #111; }
  header { margin-bottom: 24px; }
  h1 { font-size: 18px; }
  .banner-card { position: relative; border-radius: 16px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; color: #fff; }
  .banner-image { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
  .no-image { width: 48px; height: 48px; border-radius: 8px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 10px; }
  .banner-title { font-weight: bold; }
  .banner-description { font-size: 13px; opacity: 0.85; }
  .chevron { margin-left: auto; font-size: 24px; }
  .chevron-dead { text-decoration: line-through; opacity: 0.5; }
  .badges { position: absolute; bottom: -8px; left: 16px; display: flex; gap: 4px; flex-wrap: wrap; }
  .badge { font-size: 10px; background: #eee; color: #333; border-radius: 4px; padding: 2px 6px; }
  .badge-warn { background: #fff3cd; }
  .badge-dead { background: #f8d7da; }
  .sponsor { padding: 8px 0; border-bottom: 1px solid #eee; }
  .sponsor.dropped { text-decoration: line-through; opacity: 0.5; }
  .warnings { font-size: 13px; color: #a00; }
  .no-warnings { font-size: 13px; color: #090; }
  section { margin-bottom: 32px; }
</style>
</head>
<body>
  <header>
    <h1>Chronos content — revision ${document.revision}</h1>
    <p>Published ${escapeHtml(document.updatedAt)} &middot; ${banners.length} banner(s) &middot; ${sponsors.length} sponsor(s)</p>
    ${warningsHtml}
  </header>
  <section>
    <h2>Banners</h2>
    ${banners.map(bannerCard).join('\n')}
  </section>
  <section>
    <h2>Sponsors</h2>
    <h3>Master</h3>
    ${master ? sponsorRow(master, false) : '<p>none</p>'}
    <h3>Major</h3>
    ${major.map(s => sponsorRow(s, false)).join('\n')}
    ${droppedSponsors.map(s => sponsorRow(s, true)).join('\n')}
  </section>
</body>
</html>
`
}
