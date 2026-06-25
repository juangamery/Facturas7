import { useState } from 'react'
import axios from 'axios'

export default function Login({ onLoginSuccess }) {
  const [form, setForm] = useState({ usuario: '', password: '' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await axios.post('/admin/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      localStorage.setItem('logueado', 'true')
      onLoginSuccess()
    } catch (error) {
      setMessage('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 items-center justify-center">
      <div className="w-full max-w-md px-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 backdrop-blur p-8">
          <h1 className="text-3xl font-bold text-center mb-2">📱 Facturación</h1>
          <p className="text-center text-slate-400 mb-8">Panel de Administración</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Usuario</label>
              <input
                type="text"
                value={form.usuario}
                onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                placeholder="admin"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            {message && (
              <div className="p-4 rounded-lg bg-red-900/30 text-red-400 border border-red-800 text-sm">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          &copy; 2024 Facturación Electrónica Argentina
        </p>
      </div>
    </div>
  )
}
