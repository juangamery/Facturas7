import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Reportes() {
  const [facturas, setFacturas] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    fechaInicio: '',
    fechaFin: '',
    usuario: '',
    montoMin: '',
    montoMax: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [facturasRes, clientesRes] = await Promise.all([
        axios.get('/admin/facturas'),
        axios.get('/admin/clientes')
      ])
      setFacturas(facturasRes.data.facturas || [])
      setClientes(clientesRes.data.usuarios || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFacturas = facturas.filter(f => {
    const fecha = new Date(f.creado_en * 1000)
    const inicio = filters.fechaInicio ? new Date(filters.fechaInicio) : null
    const fin = filters.fechaFin ? new Date(filters.fechaFin) : null

    if (inicio && fecha < inicio) return false
    if (fin && fecha > fin) return false
    if (filters.usuario && f.usuario_id !== parseInt(filters.usuario)) return false
    if (filters.montoMin && f.importe < parseFloat(filters.montoMin)) return false
    if (filters.montoMax && f.importe > parseFloat(filters.montoMax)) return false

    return true
  })

  const stats = {
    cantidad: filteredFacturas.length,
    total: filteredFacturas.reduce((sum, f) => sum + (f.importe || 0), 0),
    promedio: filteredFacturas.length > 0 ? filteredFacturas.reduce((sum, f) => sum + (f.importe || 0), 0) / filteredFacturas.length : 0,
    maximo: filteredFacturas.length > 0 ? Math.max(...filteredFacturas.map(f => f.importe || 0)) : 0,
    minimo: filteredFacturas.length > 0 ? Math.min(...filteredFacturas.map(f => f.importe || 0)) : Infinity
  }

  const exportarCSV = () => {
    const headers = ['Número', 'Cliente', 'Concepto', 'Importe', 'Fecha']
    const rows = filteredFacturas.map(f => [
      f.numero_factura,
      f.nombre,
      f.concepto,
      f.importe,
      new Date(f.creado_en * 1000).toLocaleDateString('es-AR')
    ])

    let csv = headers.join(',') + '\n'
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n'
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Reporte_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Reportes</h1>
      <p className="text-slate-400 mb-6">Filtrar y analizar facturas</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <input
          type="date"
          value={filters.fechaInicio}
          onChange={(e) => setFilters({ ...filters, fechaInicio: e.target.value })}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
          placeholder="Fecha inicio"
        />
        <input
          type="date"
          value={filters.fechaFin}
          onChange={(e) => setFilters({ ...filters, fechaFin: e.target.value })}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
          placeholder="Fecha fin"
        />
        <select
          value={filters.usuario}
          onChange={(e) => setFilters({ ...filters, usuario: e.target.value })}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
        >
          <option value="">Todos clientes</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          value={filters.montoMin}
          onChange={(e) => setFilters({ ...filters, montoMin: e.target.value })}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
          placeholder="Monto mín"
        />
        <input
          type="number"
          step="0.01"
          value={filters.montoMax}
          onChange={(e) => setFilters({ ...filters, montoMax: e.target.value })}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
          placeholder="Monto máx"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-slate-400 text-sm mb-1">Cantidad</p>
          <p className="text-2xl font-bold">{stats.cantidad}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-slate-400 text-sm mb-1">Total</p>
          <p className="text-2xl font-bold text-green-400">${stats.total.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-slate-400 text-sm mb-1">Promedio</p>
          <p className="text-2xl font-bold text-blue-400">${stats.promedio.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-slate-400 text-sm mb-1">Máximo</p>
          <p className="text-2xl font-bold text-yellow-400">${stats.maximo.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-slate-400 text-sm mb-1">Mínimo</p>
          <p className="text-2xl font-bold text-purple-400">${stats.minimo === Infinity ? 0 : stats.minimo.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={exportarCSV}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition"
        >
          📥 Descargar CSV
        </button>
        <button
          onClick={() => setFilters({ fechaInicio: '', fechaFin: '', usuario: '', montoMin: '', montoMax: '' })}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition"
        >
          🔄 Limpiar filtros
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400">Cargando...</div>
      ) : filteredFacturas.length > 0 ? (
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Número</th>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Concepto</th>
                <th className="px-4 py-3 text-left font-medium">Importe</th>
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredFacturas.map(f => (
                <tr key={f.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium">{f.numero_factura}</td>
                  <td className="px-4 py-3">{f.nombre}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{f.concepto?.substring(0, 40)}</td>
                  <td className="px-4 py-3 text-green-400">${f.importe?.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{new Date(f.creado_en * 1000).toLocaleDateString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-12 text-center">
          <p className="text-slate-400">No hay facturas con esos filtros</p>
        </div>
      )}
    </div>
  )
}
