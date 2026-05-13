import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'http://stub.invalid')
vi.stubEnv('VITE_SUPABASE_PUB_KEY', 'sb_publishable_stub')
vi.stubEnv('VITE_API_BASE_URL', 'http://stub.invalid')
