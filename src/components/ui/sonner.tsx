import { Toaster as SonnerToaster, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme"

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()
  return (
    <SonnerToaster
      theme={resolvedTheme}
      richColors
      closeButton
      position="top-right"
      {...props}
    />
  )
}
