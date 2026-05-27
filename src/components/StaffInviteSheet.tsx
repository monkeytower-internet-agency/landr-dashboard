import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  STAFF_ROLE_OPTIONS,
  createMembership,
  findUserByEmail,
  parsePermissions,
} from '@/lib/staff'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function StaffInviteSheet({ operatorId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>(STAFF_ROLE_OPTIONS[2])
  const [permissionsText, setPermissionsText] = useState('')
  const [permissionsError, setPermissionsError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Reset state in the open-change handler instead of an effect so we don't
  // trigger React Compiler's set-state-in-effect lint and avoid a cascading
  // render hazard. (Same pattern as GdprEraseDialog.)
  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    if (!next) {
      setEmail('')
      setRole(STAFF_ROLE_OPTIONS[2])
      setPermissionsText('')
      setPermissionsError(null)
      setEmailError(null)
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!operatorId) throw new Error('No operator selected')
      const trimmedEmail = email.trim().toLowerCase()
      if (!EMAIL_RE.test(trimmedEmail)) {
        const msg = t.staff.inviteEmailRequired
        setEmailError(msg)
        throw new Error(msg)
      }
      if (!role.trim()) {
        throw new Error(t.staff.inviteRoleRequired)
      }
      const parsed = parsePermissions(permissionsText)
      if (!parsed.ok) {
        setPermissionsError(parsed.error)
        throw new Error(parsed.error)
      }
      const existing = await findUserByEmail(trimmedEmail)
      if (!existing) {
        const msg = t.staff.inviteUserNotFound
        setEmailError(msg)
        throw new Error(msg)
      }
      return createMembership({
        operator_id: operatorId,
        user_id: existing.id,
        role: role.trim(),
        permissions: parsed.value,
      })
    },
    onSuccess: () => {
      toast.success(t.staff.inviteToastSuccess)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(t.staff.inviteToastError, { description: err.message })
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setPermissionsError(null)
    mutation.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.staff.inviteTitle}</SheetTitle>
          <SheetDescription>{t.staff.inviteDescription}</SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          aria-label={t.staff.inviteTitle}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-invite-email">
              {t.staff.inviteEmailLabel}
            </Label>
            <Input
              id="staff-invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.staff.inviteEmailPlaceholder}
              disabled={mutation.isPending}
              required
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'staff-invite-email-err' : undefined}
            />
            {emailError ? (
              <p
                id="staff-invite-email-err"
                role="alert"
                className="text-destructive text-xs"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-invite-role">{t.staff.inviteRoleLabel}</Label>
            <NativeSelect
              id="staff-invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={mutation.isPending}
            >
              {STAFF_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-invite-permissions">
              {t.staff.invitePermissionsLabel}
            </Label>
            <Textarea
              id="staff-invite-permissions"
              rows={6}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={permissionsText}
              onChange={(e) => {
                setPermissionsText(e.target.value)
                setPermissionsError(null)
              }}
              placeholder='{ "manage_bookings": true }'
              disabled={mutation.isPending}
              aria-invalid={!!permissionsError}
              aria-describedby={
                permissionsError
                  ? 'staff-invite-permissions-err'
                  : 'staff-invite-permissions-hint'
              }
              className="font-mono text-xs"
            />
            {permissionsError ? (
              <p
                id="staff-invite-permissions-err"
                role="alert"
                className="text-destructive text-xs"
              >
                {permissionsError}
              </p>
            ) : (
              <p
                id="staff-invite-permissions-hint"
                className="text-muted-foreground text-xs"
              >
                {t.staff.invitePermissionsHint}
              </p>
            )}
          </div>

          <p className="text-muted-foreground border-muted-foreground/20 mt-2 rounded-md border-l-2 bg-muted/30 px-3 py-2 text-xs">
            {t.staff.inviteDeferralNotice}
          </p>
        </form>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t.staff.inviteCancel}
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={mutation.isPending || !operatorId}
          >
            {mutation.isPending
              ? t.staff.inviteSubmitting
              : t.staff.inviteSubmit}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
