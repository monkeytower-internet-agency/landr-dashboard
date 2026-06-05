import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
  mobileSheetFooter,
} from '@/lib/mobile-sheet-classes'
import {
  STAFF_ROLE_OPTIONS,
  parsePermissions,
  permissionsToText,
  staffEmailDisplay,
  updateMembership,
  type StaffRow,
} from '@/lib/staff'
import { t } from '@/lib/strings'

type Props = {
  member: StaffRow | null
  onOpenChange: (open: boolean) => void
}

// The outer component owns Sheet open/close and unmounts the inner form
// whenever the targeted member changes. That guarantees the inner form's
// useState seeds from the new `member` without needing a useEffect (and
// thus without tripping React Compiler's set-state-in-effect rule).
export function StaffEditSheet({ member, onOpenChange }: Props) {
  const open = member !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent
        className={cn('w-full sm:max-w-md', mobileSheetContent)}
      >
        {member ? (
          <StaffEditSheetBody
            key={member.id}
            member={member}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  member: StaffRow
  onClose: () => void
}

function StaffEditSheetBody({ member, onClose }: BodyProps) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [role, setRole] = useState(member.role)
  const [permissionsText, setPermissionsText] = useState(
    permissionsToText(member.permissions),
  )
  const [permissionsError, setPermissionsError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (!role.trim()) throw new Error(t.staff.inviteRoleRequired)
      const parsed = parsePermissions(permissionsText)
      if (!parsed.ok) {
        setPermissionsError(parsed.error)
        throw new Error(parsed.error)
      }
      return updateMembership(member.id, {
        role: role.trim(),
        permissions: parsed.value,
      })
    },
    onSuccess: () => {
      toast.success(t.staff.editToastSuccess)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.staff.editToastError, { description: err.message })
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPermissionsError(null)
    mutation.mutate()
  }

  // Allow free-text roles too — the curated options are suggestions, not a
  // hard enum. If the row's current role isn't one of the options, surface
  // it in the select so editors don't accidentally clobber it.
  const roleOptions: string[] = (() => {
    const all: string[] = [...STAFF_ROLE_OPTIONS]
    if (role && !all.includes(role)) all.unshift(role)
    return all
  })()

  return (
    <>
      {/* landr-3qkr.3 — sticky header below md with notch clearance. */}
      <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
        <SheetTitle>{t.staff.editTitle}</SheetTitle>
        <SheetDescription>{staffEmailDisplay(member)}</SheetDescription>
      </SheetHeader>
      <form
        onSubmit={handleSubmit}
        className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4', mobileSheetBody)}
        aria-label={t.staff.editTitle}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-edit-role">{t.staff.editRoleLabel}</Label>
          <NativeSelect
            id="staff-edit-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={mutation.isPending}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-edit-permissions">
            {t.staff.editPermissionsLabel}
          </Label>
          <Textarea
            id="staff-edit-permissions"
            rows={8}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={permissionsText}
            onChange={(e) => {
              setPermissionsText(e.target.value)
              setPermissionsError(null)
            }}
            disabled={mutation.isPending}
            aria-invalid={!!permissionsError}
            aria-describedby={
              permissionsError
                ? 'staff-edit-permissions-err'
                : 'staff-edit-permissions-hint'
            }
            className="font-mono text-xs"
          />
          {permissionsError ? (
            <p
              id="staff-edit-permissions-err"
              role="alert"
              className="text-destructive text-xs"
            >
              {permissionsError}
            </p>
          ) : (
            <p
              id="staff-edit-permissions-hint"
              className="text-muted-foreground text-xs"
            >
              {t.staff.editPermissionsHint}
            </p>
          )}
        </div>
      </form>
      {/* landr-3qkr.3 — sticky bottom bar on mobile. */}
      <SheetFooter className={cn(isMobile ? mobileSheetFooter : 'p-4')}>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          {t.staff.editCancel}
        </Button>
        <Button
          type="submit"
          onClick={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t.staff.editSubmitting : t.staff.editSubmit}
        </Button>
      </SheetFooter>
    </>
  )
}
