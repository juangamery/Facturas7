import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    numero_telefono: '',
    cuit: '',
    razon_social: '',
    plan: 'basico'
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchClientes()
  }, [filtro])

  const fetchClientes = async () => {
    try {
      const res = await axios.get(`/admin/clientes?filtro=${filtro}`)
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
      await axios.post('/admin/clientes/nuevo', form)
      setMessage('✓ Cliente creado')
      setForm({ nombre: '', numero_telefono: '', cuit: '', razon_social: '', plan: 'basico' })
      setShowForm(false)
      fetchClientes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>👥 Clientes</h1>
        <button className="btn btn-success" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo Cliente'}
        </button>
      </div>

      {message && <div className={`alert alert-${message.includes('✓') ? 'success' : 'danger'}`}>{message}</div>}

      {showForm && (
        <div className="card mb-4">
          <div className="card-header">Nuevo Cliente</div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Nombre</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    required
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Teléfono</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={form.numero_telefono}
                    onChange={(e) => setForm({ ...form, numero_telefono: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">CUIT</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.cuit}
                    onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Razón Social</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.razon_social}
                    onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Plan</label>
                <select
                  className="form-select"
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                >
                  <option value="basico">Básico</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">Crear Cliente</button>
            </form>
          </div>
        </div>
      )}

      <div className="btn-group mb-3" role="group">
        <button
          type="button"
          className={`btn ${filtro === 'todos' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setFiltro('todos')}
        >
          Todos
        </button>
        <button
          type="button"
          className={`btn ${filtro === 'activos' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setFiltro('activos')}
        >
          Activos
        </button>
        <button
          type="button"
          className={`btn ${filtro === 'vencidos' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setFiltro('vencidos')}
        >
          Vencidos
        </button>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : clientes.length > 0 ? (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>CUIT</th>
                <th>Plan</th>
                <th>Facturas</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(cliente => (
                <tr key={cliente.id}>
                  <td>{cliente.nombre}</td>
                  <td>{cliente.cuit || '-'}</td>
                  <td className="text-uppercase"><strong>{cliente.plan}</strong></td>
                  <td>{cliente.facturas_mes_actual}/{cliente.limite_facturas_mes === -1 ? '∞' : cliente.limite_facturas_mes}</td>
                  <td>{new Date(cliente.fecha_vencimiento * 1000).toLocaleDateString('es-AR')}</td>
                  <td>
                    <span className={`badge bg-${cliente.activo ? 'success' : 'warning'}`}>
                      {cliente.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="alert alert-info">No hay clientes</div>
      )}
    </div>
  )
}
