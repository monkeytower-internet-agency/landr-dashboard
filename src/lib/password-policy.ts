// landr — Mirrors the Supabase project auth setting `password_min_length`
// (raised 6 → 8 on both staging and prod). Kept as a single source of truth
// so the client-side validation in ResetPassword + SecuritySettings matches
// what GoTrue will accept; a mismatch would surface as a confusing server
// rejection after the user submits.
export const MIN_PASSWORD_LENGTH = 8
