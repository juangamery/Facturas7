import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Comprobantes() {
  const [comprobantes, setComprobantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchComprobantes()
  }, [])

  const fetchComprobantes = async () => {
    try {
      const res = await axios.get('/admin/comprobantes')
      setComprobantes(res.data.comprobantes || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const aprobar = async (id) => {
    try {
      await axios.post(`/admin/comprobantes/${id}/aprobar`, { verificado_por: 'admin' })
      setMessage('✓ Aprobado')
      fetchComprobantes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ Error')
    }
  }

  const rechazar = async (id) => {
    try {
      await axios.post(`/admin/comprobantes/${id}/rechazar`, {
        razon: 'Rechazado',
        verificado_por: 'admin'
      })
      setMessage('✓ Rechazado')
      fetchComprobantes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ Error')
    }
  }

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-2">Comprobantes</h1>
      <p className="text-slate-400 mb-8">{comprobantes.length} pendientes de verificar</p>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('✓') ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Cargando...</div>
      ) : comprobantes.length > 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-700 bg-slate-800/70">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">WhatsApp</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Fecha</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {comprobantes.map((c, i) => (
                <tr key={c.id} className={`hover:bg-slate-700/30 transition ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                  <td className="px-6 py-4 font-mono text-sm text-white">{c.numero_whatsapp}</td>
                  <td className="px-6 py-4 text-slate-300">
                    {c.tipo === 'imagen' && '📷'}
                    {c.tipo === 'audio' && '🎙️'}
                    {c.tipo === 'texto' && '📝'}
                    {' ' + c.tipo}
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{new Date(c.creado_en * 1000).toLocaleDateString('es-AR')}</td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => aprobar(c.id)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => rechazar(c.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition"
                    >
                      Rechazar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-12 text-center">
          <p className="text-slate-400">Sin comprobantes pendientes</p>
        </div>
      )}
    </div>
  )
}
