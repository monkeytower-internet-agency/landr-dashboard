import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
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
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { OperatorSwitcher } from '@/components/OperatorSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const initial = (email[0] ?? '?').toUpperCase()
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
            <span
              className="text-muted-foreground"
              aria-label="signed-in-user"
            >
              {email}
            </span>
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {t.userMenu.label}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOutIcon className="size-4" />
          <span>{t.auth.signOut}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4">
          <OperatorSwitcher />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu onSignOut={onSignOut} />
            <Button
              variant="outline"
              size="sm"
              onClick={onSignOut}
              className="hidden sm:inline-flex"
            >
              {t.auth.signOut}
            </Button>
          </div>
        </header>
        <OnboardingBanner />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
