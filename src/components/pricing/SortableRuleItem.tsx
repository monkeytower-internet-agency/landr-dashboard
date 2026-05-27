import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  PricingRuleEditor,
  RuleDragHandle,
} from './PricingRuleEditor'
import type { PricingRule } from '@/lib/pricingSchemes'

type Props = {
  rule: PricingRule
  operatorId: string
  currency: string
  onDeleted: () => void
  onRefetch: () => void
}

/**
 * Sortable wrapper for a single PricingRuleEditor — owns the dnd-kit
 * useSortable hook and threads the transform/transition styles + drag
 * handle into the rule chip. Lives alongside PricingRuleEditor so the
 * editor can stay drag-agnostic for non-sortable callers.
 */
export function SortableRuleItem({
  rule,
  operatorId,
  currency,
  onDeleted,
  onRefetch,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <PricingRuleEditor
      rule={rule}
      operatorId={operatorId}
      currency={currency}
      onDeleted={onDeleted}
      onRefetch={onRefetch}
      innerRef={setNodeRef}
      wrapperStyle={style}
      isDragging={isDragging}
      dragHandle={
        <RuleDragHandle
          attributes={attributes as unknown as Record<string, unknown>}
          listeners={listeners as unknown as Record<string, unknown>}
        />
      }
    />
  )
}
