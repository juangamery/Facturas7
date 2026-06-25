import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    nombre: '',
    numero_telefono: '',
    cuit: '',
    razon_social: '',
    email: '',
    plan: 'basico'
  })

  useEffect(() => {
    fetchClientes()
  }, [])

  const fetchClientes = async () => {
    try {
      const res = await axios.get('/admin/clientes-json')
      setClientes(res.data.usuarios || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/admin/clientes-nuevo', form)
      setMessage('✓ Cliente creado')
      setForm({ nombre: '', numero_telefono: '', cuit: '', razon_social: '', email: '', plan: 'basico' })
      setShowForm(false)
      fetchClientes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Clientes</h1>
          <p className="text-slate-400 mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
        >
          {showForm ? 'Cancelar' : '+ Nuevo'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('✓') ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
          {message}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Nuevo Cliente</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Teléfono</label>
                <input
                  type="tel"
                  value={form.numero_telefono}
                  onChange={(e) => setForm({ ...form, numero_telefono: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">CUIT</label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="cliente@ejemplo.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Razón Social</label>
              <input
                type="text"
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="basico">Básico</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Crear Cliente
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Cargando...</div>
      ) : clientes.length > 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-700 bg-slate-800/70">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Nombre</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Teléfono</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">CUIT</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Plan</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {clientes.map((c, i) => (
                <tr key={c.id} className={`hover:bg-slate-700/30 transition ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                  <td className="px-6 py-4 font-medium text-white">{c.nombre}</td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-sm">{c.numero_telefono}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{c.email || '-'}</td>
                  <td className="px-6 py-4 text-slate-400">{c.cuit || '-'}</td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded text-sm font-medium ${c.plan === 'premium' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>{c.plan}</span></td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded text-sm font-medium ${c.activo ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-12 text-center">
          <p className="text-slate-400">Sin clientes aún</p>
        </div>
      )}
    </div>
  )
}
