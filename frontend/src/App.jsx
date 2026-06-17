import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import Clientes from './components/Clientes'
import Facturas from './components/Facturas'
import Comprobantes from './components/Comprobantes'
import './App.css'

function App() {
  const [page, setPage] = useState('dashboard')
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser({ nombre: 'Admin' })
  }, [])

  return (
    <div className="app">
      <Navbar page={page} setPage={setPage} />
      <main className="main-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'clientes' && <Clientes />}
        {page === 'facturas' && <Facturas />}
        {page === 'comprobantes' && <Comprobantes />}
      </main>
    </div>
  )
}

export default App
