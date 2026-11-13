# CLAUDE.md — argus-cull

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md).

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never open a PR against `main` or push work to it directly: `main` must never be ahead of `dev`. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected and needs a PR, merge the release PR, then immediately merge `main` back into `dev` so the merge commit is not left on `main` alone.

## Web guidance

Front-end work in `web/` follows Google Chrome's [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill. Install it per user as a Claude Code plugin (`modern-web-guidance@googlechrome`). Its files are not committed here. It sends Google usage data (search queries, guide ids, agent name) unless `DISABLE_TELEMETRY=1` is set, so set that in your shell profile and in the `env` block of `~/.claude/settings.json`.

House exceptions, from the 2026-11-13 pass (#59):

- Tooltips stay the React portal in `components/Tooltip.tsx`, not `popover="hint"` with `interestfor`. Both have limited availability (no Safari), and positioning would also need the anchor-positioning polyfill. The component meets WCAG 1.4.13 itself: Escape dismisses it, and the pointer can move onto it.
- The grid does not use `content-visibility`. It renders 48 tiles a page, so there is little to skip. Thumbnails past the first two rows load lazily instead.
