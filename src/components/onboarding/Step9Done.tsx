import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

export function Step9Done() {
  return (
    <StepShell heading={t.onboarding.step9.heading} body={t.onboarding.step9.body}>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button asChild>
          <Link to="/">{t.onboarding.step9.ctaDashboard}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/bookings">{t.onboarding.step9.ctaBookings}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/calendar">{t.onboarding.step9.ctaCalendar}</Link>
        </Button>
      </div>
    </StepShell>
  )
}
