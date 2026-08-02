# Cutting a release


**Actions → Release → Run workflow → pick the branch → Run.** That is the whole
thing: no git commands, nothing installed locally.

The version comes from `module.json`, so bump it in an ordinary pull request
first — `version` **and** the version inside `download`, which must agree. The
workflow only publishes what is already on the branch you pick.

| | |
|---|---|
| **"test build" unticked** | a real release, created as a **draft** for you to read over and publish |
| **"test build" ticked** | a **pre-release**, published straight away. GitHub's "latest release" ignores pre-releases, so nobody on the normal manifest URL is offered it — testers install it from that release's own page |

Pushing a tag by hand does the same thing, for anyone who prefers the command
line: `git tag v0.5.1 && git push origin v0.5.1`. Note that a plain `git push`
does **not** push tags. A tag containing a hyphen (`v0.5.1-rc1`) is treated as a
pre-release.

Publishing a real release stays a human step deliberately. Foundry offers it to
every install the moment it goes live, so it is worth reading the notes and
checking both assets are attached first. If you would rather it published
itself, drop `--draft` from the workflow.

## What the workflow refuses

- **A version that already exists.** Bump first.
- **A tag that disagrees with `module.json`.** `download` is pinned to the
  version, so a mismatch ships a manifest pointing at a release that is not there.
- **Content that fails `verify`**, nearly all of which fails silently in Foundry.
- **Packs that were never recompiled after `src/` changed.** This one is quiet
  and nasty: the zip is `packs/` exactly as committed, with no build step, so a
  forgotten `npm run pack` ships stale content that every check otherwise passes.
  `npm run check-packs` reads the compiled packs back out and compares them to
  `src/`.

`.github/workflows/check.yml` runs the same three checks on every pull request
and on pushes to `dev` and `main`.

> `check_packs.mjs` extracts from a **copy** of each pack. `extractPack` opens the
> database read-write and rotates its MANIFEST — the same signature `verify`
> rejects as "a running Foundry wrote to this" — so reading the real packs would
> leave them dirty and fail the very next check.

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
