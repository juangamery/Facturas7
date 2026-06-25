import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Clientes from './components/Clientes'
import Facturas from './components/Facturas'
import Comprobantes from './components/Comprobantes'

function App() {
  const [page, setPage] = useState('dashboard')
  const [logueado, setLogueado] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem('logueado') === 'true'
    setLogueado(auth)
  }, [])

  if (!logueado) {
    return <Login onLoginSuccess={() => setLogueado(true)} />
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      <Navbar page={page} setPage={setPage} onLogout={() => {
        localStorage.removeItem('logueado')
        setLogueado(false)
      }} />
      <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
        {page === 'dashboard' && <Dashboard />}
        {page === 'clientes' && <Clientes />}
        {page === 'facturas' && <Facturas />}
        {page === 'comprobantes' && <Comprobantes />}
      </main>
    </div>
  )
}

export default App
