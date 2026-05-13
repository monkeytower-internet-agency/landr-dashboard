import { Route, Routes } from 'react-router-dom'
import { Dashboard } from '@/routes/Dashboard'
import { NotFound } from '@/routes/NotFound'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
