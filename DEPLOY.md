# Deploy — Cloudflare Pages

The dashboard deploys to Cloudflare Pages via `.github/workflows/deploy.yml`. The workflow:

1. Runs typecheck, lint, tests, and `npm run build`
2. Self-bootstraps the Cloudflare Pages project `landr-dashboard` on first run (idempotent)
3. Publishes `dist/` to that project
4. On `push` to `main` → production; otherwise → preview branch

## One-time setup

The workflow self-bootstraps the Pages project, so no manual `wrangler pages project create` is needed.

### GitHub secrets

The workflow needs:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo monkeytower-internet-agency/landr-dashboard --body "<token>"
gh secret set CLOUDFLARE_ACCOUNT_ID --repo monkeytower-internet-agency/landr-dashboard --body "<account-id>"
gh secret set VITE_SUPABASE_PUB_KEY --repo monkeytower-internet-agency/landr-dashboard --body "<sb_publishable_...>"
```

The Cloudflare token needs `Cloudflare Pages: Edit` scope on the account. The same token from `landr-booking-widget` works — Pages: Edit is account-scoped and applies to all projects.

Both Cloudflare values are stored in the DALM vault at `~/Projects/dalm/group_vars/all/vault.yml` (keys: `cloudflare_pages_widget_token`, `cloudflare_account_id`). Rotate there first, then re-run the `gh secret set` commands.

### Repository variables (optional)

The workflow has sensible defaults; override per environment via repo variables:

```bash
gh variable set VITE_SUPABASE_URL --repo monkeytower-internet-agency/landr-dashboard --body "https://<project>.supabase.co"
gh variable set VITE_API_BASE_URL --repo monkeytower-internet-agency/landr-dashboard --body "https://api.landr.de"
```

### Custom domain `dashboard.landr.de`

DNS is managed in DALM (Ansible/Tofu). The CNAME from `dashboard.landr.de` → `landr-dashboard.pages.dev` is filed as a separate DALM ticket (mirrors the `book.landr.de` shape from the widget). Until that's deployed, the project is reachable at `https://landr-dashboard.pages.dev/`.

## Manual trigger

```bash
gh workflow run "Deploy dashboard to Cloudflare Pages" \
  --repo monkeytower-internet-agency/landr-dashboard --ref main
gh run watch --repo monkeytower-internet-agency/landr-dashboard
```

## Verifying a deploy

```bash
curl -sI https://landr-dashboard.pages.dev/ | head -5
# → expect 200, content-type text/html
```
