# landr-dashboard

LANDR operator dashboard — React + Vite SPA on Cloudflare Pages.

Sister repos: `landr-api` (FastAPI backend), `landr-booking-widget` (public booking widget), `landr-mobile` (Expo customer app).

## Stack

- Vite 8 + React 19 + TypeScript (strict)
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

Dev Supabase runs on Magrathea at `http://100.64.0.7:54321` over Tailscale (see project root `CLAUDE.md`).

## Scripts

| Script             | Purpose                                |
| :----------------- | :------------------------------------- |
| `npm run dev`      | Vite dev server with HMR               |
| `npm run build`    | Type-check + production build to `dist/` |
| `npm run typecheck`| `tsc -b --noEmit`                      |
| `npm run lint`     | ESLint flat config                     |
| `npm test`         | Vitest (jsdom + Testing Library)       |
| `npm run preview`  | Serve the built `dist/` locally        |

`src/components/ui/**` and `src/hooks/use-mobile.ts` are shadcn-managed and ignored by ESLint.

## Environment

| Var                      | Purpose                                              |
| :----------------------- | :--------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase base URL (Tailscale in dev; cloud in prod)  |
| `VITE_SUPABASE_PUB_KEY`  | Supabase **publishable** key (anon, RLS-enforced)    |
| `VITE_API_BASE_URL`      | FastAPI base URL (`100.64.0.5:8080` dev / `api.landr.de` prod) |

`.env` is gitignored — only `.env.example` is committed.

## Deploy

Cloudflare Pages — workflow lands in `landr-m05.10`. Mirrors `landr-booking-widget/.github/workflows/deploy.yml` (self-bootstrapping `wrangler pages project create`).
