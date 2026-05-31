// User-menu dropdown: avatar trigger + signed-in email + sign-out.
//
// Lives in its own file so both the operator AppShell and the staff
// TicketSystemShell can mount the same component — neither shell needs to
// thread an onSignOut prop through (signOut and routing are global).

import { useNavigate } from 'react-router-dom'
import { LogOutIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const email = user?.email ?? ''
  const initial = (email[0] ?? '?').toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.userMenu.label}
          className="rounded-full"
        >
          <span
            aria-hidden
            className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full text-xs font-medium"
          >
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {email ? (
          <DropdownMenuLabel className="truncate text-xs font-normal">
            <span className="text-muted-foreground" aria-label="signed-in-user">
              {email}
            </span>
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {t.userMenu.label}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOutIcon className="size-4" />
          <span>{t.auth.signOut}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
