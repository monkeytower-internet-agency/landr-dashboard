/**
 * LocalizedTextField — a single text input / textarea fronted by a locale
 * tab strip (landr-14s4).
 *
 * The schema stores a base column (the English fallback) plus a `*_localized`
 * jsonb sibling keyed by locale code. The booking widget renders the exact
 * locale → base-language → base field (pickLocalized), so an EMPTY override
 * means "inherit the base text". This component models exactly that:
 *
 *   - "EN (base)" tab edits the base value.
 *   - One tab per override locale (DE today; add more via LOCALE_TABS).
 *   - Editing an override locale with an empty string strips that key — the
 *     parent receives a localized object with the key ABSENT, so the widget
 *     fallback keeps working (no empty-string masking the base text).
 *   - A small dot marks override tabs that carry a non-empty translation.
 *   - The override panel shows a muted "inherits English" hint when empty.
 *
 * Writes are plain row updates (direct Supabase REST or the existing staff
 * PATCH path), so this component is purely controlled: it owns no network,
 * just `onChange(base, localized)` with the stripped jsonb.
 */
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

// Override locales offered as tabs, in display order. The base (English)
// field is always the first tab and is NOT listed here. Add locales by
// extending this array — the component renders one tab per entry and the
// strip scales automatically. Kept module-local (not exported) so the file
// only exports the component (react-refresh/only-export-components).
const LOCALE_TABS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'de', label: 'DE' },
] as const

const BASE_TAB = '__base__'

export type LocalizedTextFieldProps = {
  /** Current base (English fallback) value. */
  base: string
  /** Current localized overrides ({ locale: text }), or null. */
  localized: Record<string, string> | null
  /**
   * Fired on every keystroke with the next base value AND the next localized
   * object with empty overrides STRIPPED (absent keys). Returns null when no
   * overrides remain so the caller PATCHes a clean jsonb.
   */
  onChange: (base: string, localized: Record<string, string> | null) => void
  /** Render a Textarea instead of an Input. */
  multiline?: boolean
  /** Accessible label for the active editor (input/textarea aria-label). */
  label: string
  /** Optional id forwarded to the base input (for an external <Label>). */
  id?: string
  /** Optional placeholder override for the base field. */
  basePlaceholder?: string
}

/**
 * Strip empty / whitespace-only overrides so the stored jsonb never masks
 * the base fallback. Returns null when nothing remains.
 */
function stripEmpty(
  localized: Record<string, string> | null,
): Record<string, string> | null {
  if (!localized) return null
  const out: Record<string, string> = {}
  for (const [code, value] of Object.entries(localized)) {
    if (value.trim() !== '') out[code] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

export function LocalizedTextField({
  base,
  localized,
  onChange,
  multiline = false,
  label,
  id,
  basePlaceholder,
}: LocalizedTextFieldProps) {
  const [activeTab, setActiveTab] = useState<string>(BASE_TAB)

  function handleBaseChange(next: string) {
    onChange(next, stripEmpty(localized))
  }

  function handleOverrideChange(code: string, next: string) {
    // Keep the raw (possibly empty) value in a working copy so the field
    // stays editable; strip before handing it to the parent so the stored
    // jsonb never carries empty keys.
    const draft = { ...(localized ?? {}), [code]: next }
    onChange(base, stripEmpty(draft))
  }

  const Editor = multiline ? Textarea : Input
  const isBase = activeTab === BASE_TAB
  const activeOverride = isBase ? '' : (localized?.[activeTab] ?? '')

  return (
    <div className="flex flex-col gap-2">
      {/* Locale tab strip */}
      <div
        role="tablist"
        aria-label={t.localized.tablistAria(label)}
        className="flex flex-wrap items-center gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isBase}
          data-testid="locale-tab-base"
          onClick={() => setActiveTab(BASE_TAB)}
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
            isBase
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-input text-muted-foreground hover:text-foreground',
          )}
        >
          {t.localized.baseTab}
        </button>
        {LOCALE_TABS.map((loc) => {
          const selected = activeTab === loc.code
          const hasOverride = (localized?.[loc.code] ?? '').trim() !== ''
          return (
            <button
              key={loc.code}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={t.localized.overrideTabAria(loc.label)}
              data-testid={`locale-tab-${loc.code}`}
              onClick={() => setActiveTab(loc.code)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              {loc.label}
              {hasOverride ? (
                <span
                  aria-label={t.localized.overrideBadgeAria(loc.label)}
                  data-testid={`locale-override-badge-${loc.code}`}
                  className="size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Active editor panel */}
      {isBase ? (
        <Editor
          id={id}
          aria-label={label}
          data-testid="locale-input-base"
          value={base}
          placeholder={basePlaceholder ?? t.localized.basePlaceholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            handleBaseChange(e.target.value)
          }
        />
      ) : (
        <div className="flex flex-col gap-1">
          <Editor
            aria-label={t.localized.overrideTabAria(
              LOCALE_TABS.find((l) => l.code === activeTab)?.label ?? activeTab,
            )}
            data-testid={`locale-input-${activeTab}`}
            value={activeOverride}
            placeholder={`${t.localized.overridePlaceholderPrefix}${activeTab.toUpperCase()}`}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              handleOverrideChange(activeTab, e.target.value)
            }
          />
          {activeOverride.trim() === '' ? (
            <p
              className="text-muted-foreground text-xs"
              data-testid={`locale-inherits-hint-${activeTab}`}
            >
              {t.localized.inheritsBaseHint}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
