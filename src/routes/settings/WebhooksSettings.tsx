// landr-ah9u — Settings → Webhooks (v1).
//
// Operator-scoped CRUD over the localStorage-backed webhook list. v1 is
// a stub: the dashboard renders the configured webhooks, lets the
// operator add/edit/delete them, and stores everything under
// `landr.dashboard.webhooks.<operatorId>` — there is no server-side
// delivery yet. v2 graduates the store to `operator_webhooks` and a
// background worker that POSTs the payloads. The 'v1 stub' notice
// makes that clear so the operator doesn't expect events to fire.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CopyIcon, PencilIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import {
  addWebhook,
  deleteWebhook,
  generateSecret,
  isHttpsUrl,
  readWebhooks,
  updateWebhook,
  WEBHOOK_EVENTS,
  type Webhook,
  type WebhookEvent,
} from '@/lib/webhooks'

export function WebhooksSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.webhooks },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.webhooks}
      />
      {currentOperatorId ? (
        <WebhooksManager operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
      )}
    </>
  )
}

type ManagerProps = {
  operatorId: string
}

type DialogMode =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; webhook: Webhook }

function WebhooksManager({ operatorId }: ManagerProps) {
  // localStorage state is mirrored into React state. Seeded lazily from
  // the synchronous read so we never render an empty list flicker on
  // first mount. We deliberately keep React Query out of the loop:
  // there's no server round-trip and the synchronous read is fast
  // enough that the wrapper would only add ceremony.
  const [hooks, setHooks] = useState<Webhook[]>(() => readWebhooks(operatorId))
  const [mode, setMode] = useState<DialogMode>({ kind: 'closed' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // When the operator switches in the topbar picker, re-hydrate from
  // THAT operator's slot. Skip the first run (state was already seeded
  // for the initial operatorId) so we don't trigger the react-hooks
  // 'setState in effect' lint — we only ever call setState here when the
  // operator value actually changed.
  const lastOperatorRef = useRef<string>(operatorId)
  useEffect(() => {
    if (lastOperatorRef.current === operatorId) return
    lastOperatorRef.current = operatorId
    setHooks(readWebhooks(operatorId))
    setMode({ kind: 'closed' })
    setConfirmDeleteId(null)
  }, [operatorId])

  const refresh = useCallback(() => {
    setHooks(readWebhooks(operatorId))
  }, [operatorId])

  function handleDelete(id: string) {
    deleteWebhook(operatorId, id)
    refresh()
    setConfirmDeleteId(null)
    toast.success(t.webhooksSettings.toastDeleted)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.webhooksSettings.title}</CardTitle>
          <CardDescription>{t.webhooksSettings.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* v1 stub notice — keep operators honest about what does and
              does not happen behind the scenes (no actual POSTs yet). */}
          <div
            className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-xs"
            data-testid="webhooks-v1-notice"
            role="status"
          >
            {t.webhooksSettings.v1Notice}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => setMode({ kind: 'add' })}
              data-testid="webhooks-add"
            >
              {t.webhooksSettings.addButton}
            </Button>
          </div>

          {hooks.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="webhooks-empty"
            >
              {t.webhooksSettings.empty}
            </p>
          ) : (
            <ul
              className="divide-y rounded-md border"
              data-testid="webhooks-list"
            >
              {hooks.map((hook) => (
                <WebhookRow
                  key={hook.id}
                  hook={hook}
                  confirmingDelete={confirmDeleteId === hook.id}
                  onEdit={() => setMode({ kind: 'edit', webhook: hook })}
                  onRequestDelete={() => setConfirmDeleteId(hook.id)}
                  onConfirmDelete={() => handleDelete(hook.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <WebhookFormDialog
        operatorId={operatorId}
        mode={mode}
        onClose={() => setMode({ kind: 'closed' })}
        onSaved={() => {
          refresh()
          setMode({ kind: 'closed' })
        }}
      />
    </div>
  )
}

// ---- row ------------------------------------------------------------

type RowProps = {
  hook: Webhook
  confirmingDelete: boolean
  onEdit: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function WebhookRow({
  hook,
  confirmingDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: RowProps) {
  return (
    <li
      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`webhook-row-${hook.id}`}
    >
      <div className="min-w-0 space-y-1">
        <p
          className="truncate font-mono text-sm"
          data-testid={`webhook-row-${hook.id}-url`}
        >
          {hook.url}
        </p>
        <p className="text-muted-foreground text-xs">
          {hook.events
            .map((e) => t.webhooksSettings.eventLabels[e])
            .join(', ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onEdit}
          data-testid={`webhook-row-${hook.id}-edit`}
        >
          <PencilIcon className="mr-1.5 h-3.5 w-3.5" />
          {t.webhooksSettings.edit}
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onConfirmDelete}
              data-testid={`webhook-row-${hook.id}-confirm-delete`}
            >
              {t.webhooksSettings.confirmDelete}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancelDelete}
            >
              {t.webhooksSettings.cancel}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRequestDelete}
            data-testid={`webhook-row-${hook.id}-delete`}
          >
            <TrashIcon className="mr-1.5 h-3.5 w-3.5" />
            {t.webhooksSettings.delete}
          </Button>
        )}
      </div>
    </li>
  )
}

// ---- add / edit dialog ---------------------------------------------

type FormDialogProps = {
  operatorId: string
  mode: DialogMode
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  url: string
  events: Set<WebhookEvent>
  secret: string
  urlError: string | null
  eventsError: string | null
}

function emptyFormState(): FormState {
  return {
    url: '',
    events: new Set<WebhookEvent>(),
    // Generate a fresh secret the moment the Add dialog mounts so the
    // operator sees a real value to copy out before saving — matches
    // the 'create reveals secret once' UX of GitHub/Stripe webhooks.
    secret: generateSecret(),
    urlError: null,
    eventsError: null,
  }
}

function stateFromWebhook(hook: Webhook): FormState {
  return {
    url: hook.url,
    events: new Set(hook.events),
    secret: hook.secret,
    urlError: null,
    eventsError: null,
  }
}

function WebhookFormDialog({
  operatorId,
  mode,
  onClose,
  onSaved,
}: FormDialogProps) {
  // Remount the inner form whenever the operator opens add/edit on a
  // different target. The key changes between 'add' and each edit row
  // (by webhook id), which forces a fresh useState seed and avoids
  // the react-hooks/set-state-in-effect lint we'd hit from a useEffect
  // that copies props into state. Render an empty closed dialog when
  // there's nothing to show — keeps the parent's Dialog mount stable
  // so close animations still play.
  if (mode.kind === 'closed') {
    return (
      <Dialog
        open={false}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      />
    )
  }
  const formKey = mode.kind === 'edit' ? `edit:${mode.webhook.id}` : 'add'
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <WebhookFormDialogBody
        key={formKey}
        operatorId={operatorId}
        mode={mode}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  )
}

type FormBodyProps = {
  operatorId: string
  mode: { kind: 'add' } | { kind: 'edit'; webhook: Webhook }
  onClose: () => void
  onSaved: () => void
}

function WebhookFormDialogBody({
  operatorId,
  mode,
  onClose,
  onSaved,
}: FormBodyProps) {
  const editing = mode.kind === 'edit'
  // Seed once from mode — the parent forces a fresh remount via key
  // when the edit target changes, so no useEffect-driven prop->state
  // copy is needed here.
  const [state, setState] = useState<FormState>(() =>
    mode.kind === 'edit' ? stateFromWebhook(mode.webhook) : emptyFormState(),
  )

  function toggleEvent(event: WebhookEvent, on: boolean) {
    setState((prev) => {
      const next = new Set(prev.events)
      if (on) next.add(event)
      else next.delete(event)
      return {
        ...prev,
        events: next,
        // Clear the events error as soon as the operator picks one.
        eventsError: next.size === 0 ? prev.eventsError : null,
      }
    })
  }

  async function handleCopySecret() {
    try {
      await navigator.clipboard.writeText(state.secret)
      toast.success(t.webhooksSettings.fieldSecretCopied)
    } catch {
      toast.error(t.webhooksSettings.fieldSecretCopyError)
    }
  }

  function handleSubmit() {
    // Validate before any mutation so the operator sees BOTH errors at
    // once if both fields are missing — better than reporting one,
    // fixing it, then surfacing the second.
    const trimmedUrl = state.url.trim()
    const urlError = !trimmedUrl
      ? t.webhooksSettings.errorUrlRequired
      : !isHttpsUrl(trimmedUrl)
        ? t.webhooksSettings.errorUrlInvalid
        : null
    const eventsError =
      state.events.size === 0
        ? t.webhooksSettings.errorEventsRequired
        : null

    if (urlError || eventsError) {
      setState((prev) => ({ ...prev, urlError, eventsError }))
      return
    }

    const events: WebhookEvent[] = WEBHOOK_EVENTS.filter((e) =>
      state.events.has(e),
    )

    if (mode.kind === 'edit') {
      updateWebhook(operatorId, mode.webhook.id, {
        url: trimmedUrl,
        events,
      })
      toast.success(t.webhooksSettings.toastUpdated)
    } else if (mode.kind === 'add') {
      addWebhook(operatorId, {
        url: trimmedUrl,
        events,
        secret: state.secret,
      })
      toast.success(t.webhooksSettings.toastCreated)
    }

    onSaved()
  }

  return (
    <DialogContent data-testid="webhook-dialog">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t.webhooksSettings.dialogEditTitle
              : t.webhooksSettings.dialogAddTitle}
          </DialogTitle>
          <DialogDescription>
            {t.webhooksSettings.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t.webhooksSettings.fieldUrl}</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder={t.webhooksSettings.fieldUrlPlaceholder}
              value={state.url}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  url: e.target.value,
                  urlError: null,
                }))
              }
              aria-invalid={state.urlError ? 'true' : undefined}
              data-testid="webhook-dialog-url"
              className="font-mono text-xs"
            />
            {state.urlError ? (
              <p className="text-destructive text-xs" role="alert">
                {state.urlError}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t.webhooksSettings.fieldUrlHint}
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t.webhooksSettings.fieldEvents}
            </legend>
            <p className="text-muted-foreground text-xs">
              {t.webhooksSettings.fieldEventsHint}
            </p>
            <div className="space-y-1">
              {WEBHOOK_EVENTS.map((event) => {
                const id = `webhook-event-${event}`
                const checked = state.events.has(event)
                return (
                  <label
                    key={event}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onChange={(e) =>
                        toggleEvent(event, e.currentTarget.checked)
                      }
                      data-testid={`webhook-dialog-event-${event}`}
                    />
                    <span>{t.webhooksSettings.eventLabels[event]}</span>
                  </label>
                )
              })}
            </div>
            {state.eventsError ? (
              <p className="text-destructive text-xs" role="alert">
                {state.eventsError}
              </p>
            ) : null}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="webhook-secret">
              {t.webhooksSettings.fieldSecret}
            </Label>
            <div className="flex gap-2">
              <Input
                id="webhook-secret"
                readOnly
                value={state.secret}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                data-testid="webhook-dialog-secret"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySecret}
                aria-label={t.webhooksSettings.fieldSecretCopy}
                data-testid="webhook-dialog-secret-copy"
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t.webhooksSettings.fieldSecretHint}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            data-testid="webhook-dialog-cancel"
          >
            {t.webhooksSettings.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            data-testid="webhook-dialog-submit"
          >
            {editing
              ? t.webhooksSettings.save
              : t.webhooksSettings.create}
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}
