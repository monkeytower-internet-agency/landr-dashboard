import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { OperatorSwitcher } from '@/components/OperatorSwitcher'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{t.app.name}</span>
            <OperatorSwitcher />
          </div>
          <div className="flex items-center gap-3">
            {user?.email ? (
              <span
                className="text-muted-foreground hidden text-sm sm:inline"
                aria-label="signed-in-user"
              >
                {user.email}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={onSignOut}>
              {t.auth.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        {children}
      </main>
    </div>
  )
}
