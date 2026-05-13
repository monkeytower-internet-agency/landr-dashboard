import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Not found</h1>
        <Link to="/" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
