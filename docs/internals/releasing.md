# Cutting a release


**Push a tag.** `.github/workflows/release.yml` does the rest:

```bash
# 1. on dev: bump module.json "version" AND the version inside "download"
# 2. merge dev -> main, then tag main
git tag v0.5.1 && git push origin v0.5.1
```

It creates a **draft** release with generated notes and both assets attached.
Publishing is the one human step, deliberately: Foundry offers a release to every
install the moment it goes live, so it is worth reading the notes and checking the
assets first.

The workflow refuses a tag that disagrees with `module.json`, before building
anything. That matters because `download` is pinned to the version — a mismatched
tag would ship a manifest pointing at a release that does not exist.

Neither workflow installs anything. `verify.py` is Python stdlib, the tests are
stdlib plus `node:test`, `release.mjs` is node builtins plus `git archive`, and the
compiled packs are committed — so there is no build step at release time and no
`npm install` anywhere in CI.

`.github/workflows/check.yml` runs `npm run verify` and `npm test` on every pull
request and on pushes to `dev` and `main`. Verify is the important half: nearly
everything it checks fails *silently* in Foundry rather than erroring, so without
it a broken reference reaches players before anyone notices.

## Doing it by hand

Still works, and needs only Node:

```bash
npm run release                              # -> dist/module.zip + dist/module.json
gh release create v<version> dist/module.zip dist/module.json --title "v<version>" --notes "..."
```

`manifest` points at `releases/latest/download/module.json` (so Foundry can always find the newest
manifest) while `download` points at a specific tag's asset. Both URLs only resolve once the
release exists and has **both** files attached — `module.json` must be uploaded as its own asset,
not just committed.

```bash
# 1. bump module.json "version" AND the version inside "download"  (release.mjs checks this)
# 2. rebuild + repack if content changed, then commit everything
npm run release                              # -> dist/module.zip + dist/module.json
gh release create v<version> dist/module.zip dist/module.json --title "v<version>" --notes "..."
```

`release.mjs` builds the zip with `git archive` from `HEAD`, so it can only ever contain committed
content, and it aborts on a dirty tree, a version/URL mismatch, or a pack with no compiled `.ldb`.
The zip holds `module.json`, `packs/`, `assets/`, `LICENSE.md`, `README.md` at the archive root —
no wrapper directory, which is what Foundry's installer expects. `dist/` is gitignored.

# The handover from `ArthurKyl/foundry-wc5e` (done, v0.5.0)


This module was built in a personal repository and published as `wc5e-bestiary` up to
v1.18.3. It moved here, to `WC5E/wc5e-foundryvtt`, and the version was reset to **0.5.0** to
reflect that the content is still being curated rather than to claim eighteen versions of
maturity. What that migration touched, in case any of it needs revisiting:

- **The module `id` changed**, `wc5e-bestiary` → `wc5e-foundryvtt`, rewriting 2,143 references
  across 793 files: every `Compendium.<id>.*` UUID in `src/`, every `modules/<id>/…` asset path,
  the settings namespace and template paths in `scripts/`, and the regexes in `verify.py`.
  `npm run verify` covers the result — a missed UUID becomes a dangling reference and a missed
  asset path fails the on-disk check — which is what makes a rename this large safe to do at all.
- **Foundry treats it as a different module.** There is no update path from `wc5e-bestiary`;
  users install this one and uninstall the old. Content already dragged into a world keeps
  pointing at the old id and has to be re-dragged. The README says so up front.
- **The seven URLs in `module.json`** (`url`, `manifest`, `download`, `bugs`, `readme`,
  `changelog`, `license`) now name this repo. `release.mjs` only checks `download` against
  `version` and that `manifest` is the `releases/latest` form, so the other five are on you.
- **`title` dropped "Unofficial Beta".** That is safe *only* because every document now sets
  `source.book`: dnd5e falls back to the package title for `source.value` when `book` is empty,
  so before v1.18.1 a title change would have silently re-labelled every source in the
  compendium browser.

**The old repository must stay public.** Every install of v1.16.0 through v1.18.3 has its
`manifest` pointing at `github.com/ArthurKyl/foundry-wc5e/releases/latest/download/module.json`.
Making it private turns that into a 404: those users get no notification and no explanation.
Archive it public and read-only instead, with its README pointing here.

**Branching.** `main` is protected; work lands on `dev` and is merged from there. Releases are
cut from `main` once `dev` is green — `release.mjs` archives `HEAD`, so whichever branch you tag
is what ships.
