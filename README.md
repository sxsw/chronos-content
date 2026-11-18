# chronos-content

Drives the banners and sponsors shown in the Chronos mobile app. This is **not** a private draft area — every commit on `main`, including every image in `images-staging/`, is publicly readable the moment it's pushed. **Nothing pre-announcement-sensitive goes here, at any stage** — not in a commit, not in an upload, not for five minutes before you plan to delete it. Git history keeps it forever even after you change or delete it.

## How to edit the content

1. Open [`content.json`](content.json) on GitHub and click the pencil icon (or go straight to the edit link: `https://github.com/sxsw/chronos-content/edit/main/content.json`).
2. Edit the JSON. `banners` and `sponsors` are each an array; see the existing entries for the shape. Do **not** add `revision` or `updatedAt` — those are stamped automatically when you publish.
3. If you're adding a new image, drag it into `images-staging/` first (**Add file → Upload files**), then reference it from `content.json` as `asset:<filename>`, for example `"imageUrl": "asset:my-banner.png"`. You can also use a plain `https://` URL if the image is already hosted elsewhere (e.g. a sponsor's own CDN).
4. Commit your change to `main`.

## How to publish

1. Open the **Actions** tab → **Publish content** → **Run workflow**.
2. Tick **dry_run** first if you want to check your change without actually publishing — it validates and builds the preview as a downloadable run artifact, but writes nothing.
3. Run it for real (dry_run unticked). If validation fails, the run turns red and the log lists every problem found — fix them on `main` and run again. **A failed run publishes nothing.**
4. Once it succeeds, check `https://sxsw.github.io/chronos-content/` — that's the live preview of exactly what the app will show, including warning badges for things like a dead CTA link or a sponsor with no logo (which gets silently dropped by the app).

Phones pick up a successful publish within about 10 minutes (GitHub Pages' CDN cache).

## The `asset:` convention

`asset:<filename>` means "the file `images-staging/<filename>` in this repo." The publish step reads it, checks it's really a PNG/JPEG/WebP under 1 MB, renames it to a content hash, and rewrites the reference to the final public URL. You never need to know or type that final URL yourself.

## Never hand-edit `gh-pages`

The `gh-pages` branch is the **published artifact** — it's generated entirely by the `publish.yml` workflow and nothing else should touch it. If you need to fix something that's live, fix it on `main` and republish; don't edit `gh-pages` directly, your change will be overwritten by the next publish.

## The fixture-sync obligation

`tests/fixtures/content-payload.json` is a copy of chronos-mobile's own test fixture for the same data contract (`src/features/slices/content/content-codecs.ts`). If that contract changes on the mobile side, **re-copy its fixture here** — the `validate.test.mjs` test that checks this fixture validates clean is the tripwire that catches the two schemas drifting apart. There's no mechanical link between the two repos; this is the only thing holding them in sync.

## Local development

```bash
node scripts/validate.mjs   # check content.json against images-staging/
node --test tests/**/*.test.mjs
```

No npm dependencies — everything here is plain Node.
