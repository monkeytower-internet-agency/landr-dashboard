// landr-1url — lightweight international-format nudge for phone inputs (no
// new dependency: a full country-selector + E.164-validated component was
// explicitly deferred). Shared by the hotel form (lib/hotels.ts) and the
// operator-address onboarding step (components/onboarding/Step3Address.tsx).
//
// `PHONE_HTML_PATTERN` is used as the native `pattern` attribute on phone
// `<input>`s — documentation / a mobile-keyboard hint. There is no bare
// <form> submit relying on it, so it is not itself the enforcement
// mechanism; `isValidPhoneFormat` is.
//
// `isValidPhoneFormat` strips separators (spaces, dashes) commonly used in
// human-formatted numbers like "+34 600 123 456" before testing, then
// requires a leading '+' followed by 7-15 digits (loose E.164 bound). An
// empty value is treated as valid here — required-ness is checked
// separately by each call site so this helper works for both required and
// optional phone fields.
export const PHONE_HTML_PATTERN = '\\+[1-9][0-9 -]{6,14}'

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s-]/g, '')
}

export function isValidPhoneFormat(phone: string): boolean {
  const trimmed = phone.trim()
  if (!trimmed) return true
  return /^\+[1-9]\d{6,14}$/.test(normalizePhone(trimmed))
}
