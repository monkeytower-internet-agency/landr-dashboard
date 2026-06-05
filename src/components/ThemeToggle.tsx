import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'
import { t } from '@/lib/strings'

type Props = {
  /** Extra classes forwarded to the Button — e.g. `"hidden md:flex"` to
   *  hide below the md breakpoint when a TopbarMoreMenu handles it. */
  className?: string
}

export function ThemeToggle({ className }: Props) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
      className={className}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  )
}
