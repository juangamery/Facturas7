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
      const res = await axios.get('/admin/stats')
      setStats(res.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-slate-400">Cargando...</div>

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
      <p className="text-slate-400 mb-8">Resumen de actividad</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 hover:border-slate-600 transition">
          <p className="text-slate-400 text-sm font-medium mb-2">Usuarios Activos</p>
          <p className="text-3xl font-bold text-blue-400">{stats?.usuariosActivos || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 hover:border-slate-600 transition">
          <p className="text-slate-400 text-sm font-medium mb-2">Vencidos</p>
          <p className="text-3xl font-bold text-red-400">{stats?.usuariosVencidos || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 hover:border-slate-600 transition">
          <p className="text-slate-400 text-sm font-medium mb-2">Facturas Hoy</p>
          <p className="text-3xl font-bold text-green-400">{stats?.facturasHoy || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 hover:border-slate-600 transition">
          <p className="text-slate-400 text-sm font-medium mb-2">Facturas Mes</p>
          <p className="text-3xl font-bold text-amber-400">{stats?.facturasDelMes || 0}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6">
        <h2 className="text-xl font-bold text-white mb-4">Últimas Facturas</h2>
        {stats?.ultimasFacturas && stats.ultimasFacturas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold">Número</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold">Cliente</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold">Concepto</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold">Importe</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {stats.ultimasFacturas.map((f, i) => (
                  <tr key={f.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                    <td className="py-3 px-4 font-medium text-white">{f.numero_factura}</td>
                    <td className="py-3 px-4 text-slate-300">{f.nombre}</td>
                    <td className="py-3 px-4 text-slate-400 truncate">{f.concepto?.substring(0, 30)}</td>
                    <td className="py-3 px-4 text-right text-green-400 font-semibold">${f.importe?.toLocaleString('es-AR')}</td>
                    <td className="py-3 px-4 text-slate-400">{new Date(f.creado_en * 1000).toLocaleDateString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400">Sin facturas</p>
        )}
      </div>
    </div>
  )
}
