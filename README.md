# landr-dashboard

LANDR operator dashboard — React + Vite SPA on Cloudflare Pages.

Sister repos: `landr-api` (FastAPI backend), `landr-booking-widget` (public booking widget), `landr-mobile` (Expo customer app).

## Stack

- Vite 8 + React 19 + TypeScript (strict-mode ratchet — see "TypeScript strict ratchet" below)
- Tailwind CSS v4 (via `@tailwindcss/vite`) + shadcn/ui (`new-york`, neutral)
- React Router v7
- Supabase JS client (RLS-enforced; auth wiring lands in `landr-m05.2`)
- Vitest + Testing Library
- PWA-ready (manifest + empty service-worker stub; full PWA in `landr-m05.11`)

Decision record: [`../decisions/2026-05-13-dashboard-stack.md`](../decisions/2026-05-13-dashboard-stack.md).

## Setup

```bash
cp .env.example .env  # fill in dev Supabase URL + publishable key
npm install
npm run dev           # http://localhost:5173
```

Dev Supabase: Studio at `https://supabase.dev.landr.de` · Kong API at `https://kong.dev.landr.de` · FastAPI at `https://api.dev.landr.de` (all Trillian via Caddy — see project root `CLAUDE.md`).

## Scripts

| Script             | Purpose                                |
| :----------------- | :------------------------------------- |
| `npm run dev`      | Vite dev server with HMR               |
| `npm run build`    | Type-check + production build to `dist/` |
| `npm run typecheck`| `tsc -b --noEmit`                      |
| `npm run lint`     | ESLint flat config                     |
| `npm test`         | Vitest (jsdom + Testing Library)       |
| `npm run preview`  | Serve the built `dist/` locally        |
| `npm run gen:types`| Regenerate `src/types/database.gen.ts` from the local Supabase stack (landr-api/supabase is the schema source of truth) |
| `npm run gen:api-types` (landr-y3oj.2) | Regenerate `src/types/api.gen.ts` from `contracts/openapi.json` (a committed copy of landr-api's `openapi.json`). See landr-api README "Contracts codegen" for the full cross-repo regen loop + CI drift check. |
| `npm run typecheck:strict` (landr-0ji4.2) | Strict-mode ratchet — see below |
| `npm run typecheck:strict:update` (landr-0ji4.2) | Shrink the strict-ratchet baseline after fixing errors |

`src/components/ui/**` and `src/hooks/use-mobile.ts` are shadcn-managed and ignored by ESLint.

## TypeScript strict ratchet (landr-0ji4.2)

`tsconfig.app.json` does not set `"strict": true` — flipping it repo-wide in
one PR isn't realistic for a 100+ route app, and doing so would immediately
break the normal build (`npm run typecheck` / `tsc -b`, which CI also
requires to stay green). Instead there's a ratchet:

- `scripts/strict-ratchet.mjs` runs the same project through
  `tsc -p tsconfig.app.json --strict --noEmit` (a one-off, separate from the
  real build) and counts the resulting errors, excluding generated files
  (`src/types/*.gen.ts`, landr-y3oj.2) so unrelated codegen regen can't move
  the count.
- The count is compared against the checked-in `strict-baseline.json`
  (`{ "maxErrors": N }`). CI (`npm run typecheck:strict`) **fails only if the
  count goes up** — it prints the new errors and the delta.
- Baseline today: **0** for both `landr-dashboard` and `landr-booking-widget`
  — the existing code already happens to be strict-clean; the ratchet's job
  is to keep it that way while `tsconfig.app.json` itself stays relaxed as a
  safety net for future code that hasn't been strict-checked yet.

**Shrink-on-touch rule:** if you're already editing a file and strict mode
now reports fewer (or zero) errors for it, run
`npm run typecheck:strict:update` in the same PR to lower the baseline — do
not do a dedicated cleanup PR just to shrink it, and never raise the
baseline by hand to make CI pass; fix the new errors instead.

## Environment

| Var                      | Purpose                                              |
| :----------------------- | :--------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase base URL (Tailscale in dev; cloud in prod)  |
| `VITE_SUPABASE_PUB_KEY`  | Supabase **publishable** key (anon, RLS-enforced)    |
| `VITE_API_BASE_URL`      | FastAPI base URL (`https://api.dev.landr.de` dev / `https://api.landr.de` prod) |

`.env` is gitignored — only `.env.example` is committed.

## Deploy

Cloudflare Pages — workflow lands in `landr-m05.10`. Mirrors `landr-booking-widget/.github/workflows/deploy.yml` (self-bootstrapping `wrangler pages project create`).
