// landr-7dya.19 — deploy-tier reader.
// VITE_DEPLOY_TIER is injected per-branch in .github/workflows/deploy.yml:
//   dev branch    → 'dev'
//   staging branch → 'staging'
//   main branch   → 'prod'
// Absent (local dev without the var) → null; unrecognized value → null.

export type Tier = 'dev' | 'staging' | 'prod' | null

export function getTier(): Tier {
  const raw = import.meta.env.VITE_DEPLOY_TIER
  if (raw === 'dev' || raw === 'staging' || raw === 'prod') return raw
  return null
}
