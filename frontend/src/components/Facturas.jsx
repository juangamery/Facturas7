import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Facturas() {
  const [facturas, setFacturas] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    usuario_id: '',
    razon_social_cliente: '',
    documento_cliente: '',
    items: [{ concepto: '', importe: '' }]
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [facturasRes, clientesRes] = await Promise.all([
        axios.get('/admin/facturas-json'),
        axios.get('/admin/clientes-json')
      ])
      setFacturas(facturasRes.data.facturas || [])
      setClientes(clientesRes.data.usuarios || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { concepto: '', importe: '' }]
    })
  }

  const removeItem = (idx) => {
    if (form.items.length > 1) {
      setForm({
        ...form,
        items: form.items.filter((_, i) => i !== idx)
      })
    }
  }

  const handleItemChange = (idx, field, value) => {
    const newItems = [...form.items]
    newItems[idx][field] = value
    setForm({ ...form, items: newItems })
  }

  const totalFactura = form.items.reduce((sum, item) => {
    return sum + (parseFloat(item.importe) || 0)
  }, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const conceptoCompleto = form.items
        .map(item => `${item.concepto} - $${parseFloat(item.importe).toFixed(2)}`)
        .join(' | ')

      await axios.post('/admin/facturas-nuevo', {
        usuario_id: form.usuario_id,
        razon_social_cliente: form.razon_social_cliente,
        documento_cliente: form.documento_cliente,
        concepto: conceptoCompleto,
        importe: totalFactura
      })
      setMessage('✓ Factura creada')
      setForm({ usuario_id: '', razon_social_cliente: '', documento_cliente: '', items: [{ concepto: '', importe: '' }] })
      setShowForm(false)
      fetchData()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Facturas</h1>
          <p className="text-slate-400 mt-1">{facturas.length} facturas generadas</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
        >
          {showForm ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('✓') ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
          {message}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Nueva Factura</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Cliente</label>
                <select
                  value={form.usuario_id}
                  onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Selecciona cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Razón Social</label>
                <input
                  type="text"
                  value={form.razon_social_cliente}
                  onChange={(e) => setForm({ ...form, razon_social_cliente: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Documento</label>
              <input
                type="text"
                value={form.documento_cliente}
                onChange={(e) => setForm({ ...form, documento_cliente: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Ítems</h3>
              <div className="space-y-3">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Concepto"
                      value={item.concepto}
                      onChange={(e) => handleItemChange(idx, 'concepto', e.target.value)}
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none text-sm"
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Precio"
                      value={item.importe}
                      onChange={(e) => handleItemChange(idx, 'importe', e.target.value)}
                      className="w-24 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={form.items.length === 1}
                      className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 text-red-400 rounded-lg text-sm transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addItem}
                className="mt-3 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 transition"
              >
                + Agregar ítem
              </button>
            </div>

            <div className="rounded-lg bg-slate-700/30 border border-slate-700 p-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Total:</span>
                <span className="text-2xl font-bold text-green-400">${totalFactura.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Crear Factura
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Cargando...</div>
      ) : facturas.length > 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-700 bg-slate-800/70">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Número</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Cliente</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Concepto</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Importe</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Fecha</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {facturas.map((f, i) => (
                <tr key={f.id} className={`hover:bg-slate-700/30 transition ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                  <td className="px-6 py-4 font-medium text-white">{f.numero_factura}</td>
                  <td className="px-6 py-4 text-slate-300">{f.nombre}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm truncate">{f.concepto?.substring(0, 40)}</td>
                  <td className="px-6 py-4 text-right text-green-400 font-semibold">${f.importe?.toLocaleString('es-AR')}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{new Date(f.creado_en * 1000).toLocaleDateString('es-AR')}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => window.location.href = `/admin/facturas-descargar/${f.id}`}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition"
                    >
                      📥 PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-12 text-center">
          <p className="text-slate-400">Sin facturas aún</p>
        </div>
      )}
    </div>
  )
}
