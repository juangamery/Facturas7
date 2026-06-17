import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await axios.get('/admin/dashboard')
      setStats(res.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="container mt-4"><p>Cargando...</p></div>

  return (
    <div className="container mt-4">
      <h1>📊 Dashboard</h1>

      <div className="row mt-4">
        <div className="col-md-6 col-lg-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title text-muted">Usuarios Activos</h5>
              <h2 style={{ color: '#667eea' }}>{stats?.usuariosActivos || 0}</h2>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title text-muted">Vencidos</h5>
              <h2 style={{ color: '#ef4444' }}>{stats?.usuariosVencidos || 0}</h2>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title text-muted">Facturas Hoy</h5>
              <h2 style={{ color: '#10b981' }}>{stats?.facturasHoy || 0}</h2>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title text-muted">Facturas Mes</h5>
              <h2 style={{ color: '#f59e0b' }}>{stats?.facturasDelMes || 0}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h5 className="mb-0">Últimas Facturas</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">Sin facturas aún</p>
        </div>
      </div>
    </div>
  )
}
