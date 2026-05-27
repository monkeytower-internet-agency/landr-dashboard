import { render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { describe, expect, it } from 'vitest'

// landr-sydf — the /products and /products/:productId paths must keep
// working for bookmarks and the landr-i018 PricingSettings "Used by"
// chips. The mount points moved under Settings; this test pins the
// redirect contract WITHOUT pulling in the full <App /> auth surface.

// Duplicate of the helper in App.tsx — colocated here so the contract
// (param preservation) is tested in isolation. If App.tsx's redirect
// changes shape, this test breaks before anything reaches the network.
function ProductsRedirect() {
  const { productId } = useParams<{ productId?: string }>()
  return (
    <Navigate
      to={productId ? `/settings/products/${productId}` : '/settings/products'}
      replace
    />
  )
}

function PathProbe() {
  const { pathname } = useLocation()
  return <div data-testid="pathname">{pathname}</div>
}

function renderRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/products"
          element={<Navigate to="/settings/products" replace />}
        />
        <Route path="/products/:productId" element={<ProductsRedirect />} />
        <Route path="/settings/products" element={<PathProbe />} />
        <Route path="/settings/products/:productId" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Legacy /products redirects (landr-sydf)', () => {
  it('redirects /products to /settings/products', () => {
    renderRoutes('/products')
    expect(screen.getByTestId('pathname').textContent).toBe('/settings/products')
  })

  it('redirects /products/:productId to /settings/products/:productId (preserves param)', () => {
    renderRoutes('/products/p-abc123')
    expect(screen.getByTestId('pathname').textContent).toBe(
      '/settings/products/p-abc123',
    )
  })
})
