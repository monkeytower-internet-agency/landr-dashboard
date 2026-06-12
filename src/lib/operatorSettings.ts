import { z } from 'zod'
import { api } from '@/lib/api-client'

export const TaxIdKindSchema = z.enum(['es_nif', 'es_cif', 'de_ust_idnr', 'uk_vat', 'fr_siren', 'generic_eu_vat', 'other'])
export type TaxIdKind = z.infer<typeof TaxIdKindSchema>
export const TAX_ID_KIND_LABELS: Record<TaxIdKind, string> = {
  es_nif: 'ES NIF (individual)',
  es_cif: 'ES CIF (company)',
  de_ust_idnr: 'DE USt-IdNr.',
  uk_vat: 'UK VAT',
  fr_siren: 'FR SIREN',
  generic_eu_vat: 'EU VAT (other)',
  other: 'Other',
}

// landr-f1s — accept 'HH:mm' or 'HH:mm:ss' (Postgres time returns the latter
// via PostgREST). Normalization isn't needed — formatTime() accepts both.
const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Must be HH:mm.')

export const OperatorSettingsSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Company name is required.'),
  legal_name: z.string().nullable().optional(),
  slug: z.string(),
  tax_id: z.string().nullable().optional(),
  tax_id_kind: TaxIdKindSchema.nullable().optional(),
  phone: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().length(2, 'Must be ISO-3166 alpha-2 (e.g. DE).').nullable().optional(),
  timezone: z.string().nullable().optional(),
  default_locale: z.string().nullable().optional(),
  onboarded_at: z.string().nullable().optional(),
  // landr-f1s — calendar display prefs.
  work_hours_start: TimeOfDaySchema.nullable().optional(),
  work_hours_end: TimeOfDaySchema.nullable().optional(),
  time_format_24h: z.boolean().nullable().optional(),
  // landr-m4zq — first day of week (0=Sunday..6=Saturday). Mirrors the
  // DB CHECK constraint (BETWEEN 0 AND 6) and the API Pydantic ge/le.
  first_day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  // landr-c3t — premium-tease opt-in.
  show_premium_teasers: z.boolean().nullable().optional(),
  // landr-yp8x — operator branding shown in the embedded booking widget.
  // logo_url is the public URL of an image uploaded to the operator-logos
  // storage bucket (Settings → Branding handles the upload). primary_color
  // is the 7-char hex (#RRGGBB) the widget injects as a CSS variable for
  // the CTA buttons; mirrors the DB operators_primary_color_hex_chk.
  logo_url: z.string().nullable().optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour like #FF8800.')
    .nullable()
    .optional(),
  // landr-nils — operator-configurable copy rendered around the embedded
  // booking widget. widget_headline + widget_description sit above the widget
  // (the operator may put legal info in the description); widget_footer sits
  // below it (no headline). All optional/nullable; max lengths mirror the API
  // (OperatorPatch) + DB CHECK constraints (operators_widget_*_len_chk).
  widget_headline: z.string().max(200).nullable().optional(),
  widget_description: z.string().max(2000).nullable().optional(),
  widget_footer: z.string().max(2000).nullable().optional(),
  // landr-znzz.7 — opt-in weather forecast hint for the conditions verdict
  // pre-fill. OFF by default; operator enables in Settings → Weather.
  // weather_provider is the provider slug (currently only 'open_meteo').
  // lat/lon are WGS-84 coordinates for the fetch location.
  weather_enabled: z.boolean().nullable().optional(),
  weather_provider: z.string().nullable().optional(),
  weather_lat: z.number().nullable().optional(),
  weather_lon: z.number().nullable().optional(),
  // landr-x5o5.7 — language used for hotel-facing emails (hotel_request /
  // hotel_confirmation). NULL = fall back to customer/operator locale. Mirrors
  // max_length of default_locale (API: 10 chars). Editable in Settings → Company.
  hotel_email_locale: z.string().nullable().optional(),
  // landr-jb1k — operator-configurable booking-widget presentation.
  // widget_variant picks the showcased layout (aurora/summit/alpine); NULL =
  // the widget's default (aurora). widget_category_columns clamps the >=md
  // category grid to a fixed column count (1..4); NULL = the widget's
  // count-aware auto. Both mirror the DB CHECK constraints (landr-jb1k.1) and
  // are edited in Settings → Booking widget. The ?variant= URL param still
  // overrides widget_variant for preview.
  widget_variant: z
    .enum(['aurora', 'summit', 'alpine'])
    .nullable()
    .optional(),
  widget_category_columns: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .optional(),
  // landr-jb1k — booking-widget title typography. widget_tile_font picks the
  // font family used for product/category titles in the widget; NULL =
  // 'system' default. widget_title_case applies a CSS text-transform to those
  // titles; NULL = render titles exactly as entered. Both mirror the DB CHECK
  // constraints (landr-jb1k.1) and are edited in Settings → Booking widget.
  widget_tile_font: z
    .enum([
      'system',
      'playfair',
      'montserrat',
      'bebas',
      'space-grotesk',
      'caveat',
    ])
    .nullable()
    .optional(),
  widget_title_case: z
    .enum(['uppercase', 'lowercase', 'capitalize'])
    .nullable()
    .optional(),
  // landr-jb1k.4 — booking-widget creative tile-style options for the category
  // grid. Each NULL = the widget's current/auto behaviour (the variant token
  // wins) so untouched embeds never shift. widget_tile_radius sets the tile
  // corner radius; widget_tile_aspect the tile ratio; widget_tile_scrim the
  // text-overlay gradient tint (light forces dark title text, AA enforced);
  // widget_tile_hover the hover interaction. All mirror the DB CHECK
  // constraints (landr-jb1k.4) and are edited in Settings → Booking widget.
  widget_tile_radius: z
    .enum(['sharp', 'rounded', 'round'])
    .nullable()
    .optional(),
  widget_tile_aspect: z
    .enum(['square', 'landscape', 'wide'])
    .nullable()
    .optional(),
  widget_tile_scrim: z
    .enum(['dark', 'brand', 'light'])
    .nullable()
    .optional(),
  widget_tile_hover: z
    .enum(['lift', 'zoom', 'none'])
    .nullable()
    .optional(),
  // landr-znzz.11 — extended branding: dark-mode logo + 3-colour theme.
  // logo_dark_url: optional dark-mode variant uploaded to the same bucket.
  // theme: { brand, accent, background } (light) + optional dark overrides.
  logo_dark_url: z.string().nullable().optional(),
  theme: z
    .object({
      brand: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
        .optional(),
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
        .optional(),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
        .optional(),
      dark: z
        .object({
          brand: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
            .optional(),
          accent: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
            .optional(),
          background: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 7-char hex colour.')
            .optional(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  // landr-atwy — per-operator opt-in toggle for the post-booking
  // "Track this booking in the LANDR app" account-link prompt. OFF by
  // default for privacy; operator enables here once magic-link email
  // (landr-16u9) is confirmed working in production.
  offer_account_link: z.boolean().nullable().optional(),
  // landr-c3t — embedded subscription_package (read-only on Settings; the
  // GET returns it via PostgREST FK join). Drives the disabled-on UX for
  // free-tier operators so they can't opt out of teasers.
  // landr-8ey8 — field is `subscription_package` (was `package`) so the
  // API row shape matches the direct-PostgREST shape in `lib/operator.tsx`.
  subscription_package: z
    .object({
      slug: z.string(),
      name: z.string(),
      allowed_product_kinds: z.array(z.string()),
    })
    .nullable()
    .optional(),
})

export type OperatorSettings = z.infer<typeof OperatorSettingsSchema>

const OperatorPatchBaseSchema = OperatorSettingsSchema.omit({
  id: true,
  slug: true,
  // landr-c3t — subscription_package is a read-only PostgREST embed, never patched.
  subscription_package: true,
}).partial()

// landr-f1s — mirrors the API model_validator and the DB CHECK constraint
// operators_work_hours_chk. When BOTH endpoints are present in the same
// patch, end must be strictly greater than start. Single-sided patches
// defer to the DB constraint.
export const OperatorPatchSchema = OperatorPatchBaseSchema.refine(
  (data) => {
    if (!data.work_hours_start || !data.work_hours_end) return true
    return data.work_hours_end > data.work_hours_start
  },
  {
    message: 'Work hours end must be later than start.',
    path: ['work_hours_end'],
  },
)
export type OperatorPatch = z.infer<typeof OperatorPatchSchema>

export const GmailStatusSchema = z.object({
  connected: z.boolean(),
  email_address: z.string().nullable().optional(),
  connected_at: z.string().nullable().optional(),
  last_send_at: z.string().nullable().optional(),
})
export type GmailStatus = z.infer<typeof GmailStatusSchema>

export async function fetchOperator(operatorId: string): Promise<OperatorSettings> {
  return api<OperatorSettings>('GET', `/api/staff/operators/${operatorId}`)
}

export async function patchOperator(
  operatorId: string,
  patch: OperatorPatch,
): Promise<OperatorSettings> {
  return api<OperatorSettings>('PATCH', `/api/staff/operators/${operatorId}`, patch)
}

export async function fetchGmailStatus(operatorId: string): Promise<GmailStatus> {
  return api<GmailStatus>('GET', `/api/staff/operators/${operatorId}/integrations/gmail`)
}

export async function fetchGmailInstallUrl(
  operatorId: string,
): Promise<{ install_url: string; state: string }> {
  return api<{ install_url: string; state: string }>(
    'GET',
    `/api/staff/operators/${operatorId}/integrations/gmail/install`,
  )
}

export async function markOnboarded(
  operatorId: string,
): Promise<OperatorSettings> {
  return patchOperator(operatorId, { onboarded_at: new Date().toISOString() })
}

export async function disconnectGmail(operatorId: string): Promise<void> {
  await api<void>('DELETE', `/api/staff/operators/${operatorId}/integrations/gmail`)
}

// landr-6ybs — per-operator subscribable ICS calendar feed.
// GET auto-creates the token row on first read, so the dashboard can
// render the URL immediately without an explicit "enable" step. POST
// rotates the token (invalidates the prior URL).
export const OperatorIcalTokenSchema = z.object({
  url: z.string(),
  token: z.string(),
})
export type OperatorIcalToken = z.infer<typeof OperatorIcalTokenSchema>

export async function fetchOperatorIcalToken(
  operatorId: string,
): Promise<OperatorIcalToken> {
  return api<OperatorIcalToken>(
    'GET',
    `/api/staff/operators/${operatorId}/ical-token`,
  )
}

export async function regenerateOperatorIcalToken(
  operatorId: string,
): Promise<OperatorIcalToken> {
  return api<OperatorIcalToken>(
    'POST',
    `/api/staff/operators/${operatorId}/ical-token`,
  )
}

// landr-znzz.7 — weather forecast hint for the conditions pre-fill.
//
// The API returns one of three shapes:
//   {enabled: false}                            — weather opt-in is off
//   {enabled: true, error: string}              — enabled but provider failed
//   {enabled: true, provider, date, hint, detail} — full forecast
//
// The `hint` string is a compact human-readable summary from the API
// (e.g. "Partly cloudy · 18–25°C · wind 15 km/h W · cloud 30%").
// The `detail` object carries the raw numeric values for any further
// rendering the dashboard wants to do.

export type WeatherForecastDetail = {
  weather_code: number | null
  temperature_max: number | null
  temperature_min: number | null
  wind_speed_max_kmh: number | null
  wind_direction_dominant_deg: number | null
  cloud_cover_mean_pct: number | null
}

export type WeatherForecast =
  | { enabled: false }
  | { enabled: true; error: string }
  | {
      enabled: true
      provider: string
      date: string
      hint: string
      detail: WeatherForecastDetail
    }

export async function fetchWeatherForecast(
  operatorId: string,
  date: string,
): Promise<WeatherForecast> {
  return api<WeatherForecast>(
    'GET',
    `/api/staff/operators/${operatorId}/weather-forecast?date=${encodeURIComponent(date)}`,
  )
}

// ---------------------------------------------------------------------------
// landr-1nwu.2 — per-operator payment/ERP integration credentials.
//
// SECURITY-CRITICAL: these are operator PAYMENT secrets (Stripe secret +
// webhook signing secret, Holded API key). The API stores them encrypted at
// rest and NEVER returns a decrypted secret — the masked-read endpoint returns
// only the NON-secret Stripe publishable key plus has_* booleans. The dashboard
// therefore renders secrets WRITE-ONLY: "Configured ••••" when set, a plaintext
// input to rotate/replace, never the stored value. Writes route through the
// FastAPI endpoint (encryption is a server-side side-effect — see the
// write-routing-convention).
// ---------------------------------------------------------------------------

export const StripeMode = ['test', 'live'] as const
export type StripeMode = (typeof StripeMode)[number]
export const HoldedMode = ['demo', 'live'] as const
export type HoldedMode = (typeof HoldedMode)[number]

// One MASKED credential bundle as returned by the API. The encrypted secret
// values are NEVER present — only the booleans (has_*) and the non-secret
// publishable key.
export const IntegrationCredentialSchema = z.object({
  provider: z.enum(['stripe', 'holded']),
  mode: z.string(),
  stripe_publishable_key: z.string().nullable().optional(),
  has_secret_key: z.boolean(),
  has_webhook_secret: z.boolean(),
  has_holded_key: z.boolean(),
  updated_by: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})
export type IntegrationCredential = z.infer<typeof IntegrationCredentialSchema>

export const IntegrationCredentialsListSchema = z.array(
  IntegrationCredentialSchema,
)

// PUT body. All fields optional so the operator can rotate a single secret
// without re-sending the others. The publishable key is non-secret; the rest
// are encrypted server-side before the write.
export type StripeCredentialUpsert = {
  stripe_publishable_key?: string
  stripe_secret_key?: string
  stripe_webhook_secret?: string
}
export type HoldedCredentialUpsert = {
  holded_api_key?: string
}

export async function fetchIntegrationCredentials(
  operatorId: string,
): Promise<IntegrationCredential[]> {
  const data = await api<unknown>(
    'GET',
    `/api/staff/operators/${operatorId}/integration-credentials`,
  )
  return IntegrationCredentialsListSchema.parse(data)
}

export async function upsertStripeCredential(
  operatorId: string,
  mode: StripeMode,
  body: StripeCredentialUpsert,
): Promise<IntegrationCredential> {
  const data = await api<unknown>(
    'PUT',
    `/api/staff/operators/${operatorId}/integration-credentials/stripe/${mode}`,
    body,
  )
  return IntegrationCredentialSchema.parse(data)
}

export async function upsertHoldedCredential(
  operatorId: string,
  mode: HoldedMode,
  body: HoldedCredentialUpsert,
): Promise<IntegrationCredential> {
  const data = await api<unknown>(
    'PUT',
    `/api/staff/operators/${operatorId}/integration-credentials/holded/${mode}`,
    body,
  )
  return IntegrationCredentialSchema.parse(data)
}
