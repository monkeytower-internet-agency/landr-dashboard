import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  heading: string
  body?: string
  children?: ReactNode
}

export function StepShell({ heading, body, children }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {body ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}
