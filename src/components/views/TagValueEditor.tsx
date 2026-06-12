// Extracted from ViewFilterChips.tsx (landr-v9e4.9 — pure-helper extraction).
// TagValueEditor lives here; ViewFilterChips imports it.

import { useQuery } from '@tanstack/react-query'
import { Checkbox } from '@/components/ui/checkbox'
import { fetchTags, type Tag } from '@/lib/tags'
import { useOperator } from '@/lib/operator'
import { MULTI_VALUE_OPS, type FilterOp, type FilterValue } from '@/lib/views-filters'
import { t } from '@/lib/strings'

type TagValueEditorProps = {
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

// landr-iz58 — TagValueEditor renders a checklist of the operator's tags.
// Values are tag uuids; the user picks one (eq) or many (in). Each row
// shows the tag's color swatch + name for fast scanning.
export function TagValueEditor({ op, values, onChange }: TagValueEditorProps) {
  const allowMulti = MULTI_VALUE_OPS.has(op)
  const { currentOperatorId } = useOperator()
  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', currentOperatorId ?? 'none'],
    queryFn: () =>
      currentOperatorId ? fetchTags(currentOperatorId) : Promise.resolve([]),
    enabled: !!currentOperatorId,
    staleTime: 30_000,
  })

  if (tagsQuery.isPending) {
    return (
      <p className="text-muted-foreground py-1 text-xs">
        Loading tags…
      </p>
    )
  }
  if (tagsQuery.isError) {
    return (
      <p className="text-destructive py-1 text-xs" role="alert">
        Could not load tags.
      </p>
    )
  }
  const tags = tagsQuery.data ?? []
  if (tags.length === 0) {
    return (
      <p className="text-muted-foreground py-1 text-xs">
        No tags defined yet. Add tags in Settings → Tags.
      </p>
    )
  }

  return (
    <fieldset className="flex flex-col gap-1" data-testid="filter-editor-tags">
      <legend className="text-xs font-medium">{t.views.filters.valueLabel}</legend>
      {tags.map((tag) => {
        const checked = values.includes(tag.id)
        return (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <Checkbox
              checked={checked}
              onChange={(e) => {
                const isChecked = e.target.checked
                if (allowMulti) {
                  onChange(
                    isChecked
                      ? [...values, tag.id]
                      : values.filter((x) => x !== tag.id),
                  )
                } else {
                  onChange(isChecked ? [tag.id] : [])
                }
              }}
              data-testid={`filter-editor-tag-${tag.id}`}
            />
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: tag.color }}
              aria-hidden="true"
            />
            {tag.name}
          </label>
        )
      })}
    </fieldset>
  )
}
