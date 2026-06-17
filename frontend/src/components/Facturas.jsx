import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Facturas() {
  const [facturas, setFacturas] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    usuario_id: '',
    razon_social_cliente: '',
    documento_cliente: '',
    concepto: '',
    importe: ''
  })
  const [message, setMessage] = useState('')

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/admin/facturas/nuevo', form)
      setMessage('✓ Factura creada')
      setForm({ usuario_id: '', razon_social_cliente: '', documento_cliente: '', concepto: '', importe: '' })
      setShowForm(false)
      fetchData()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>📄 Facturas</h1>
        <button className="btn btn-success" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nueva Factura'}
        </button>
      </div>

      {message && <div className={`alert alert-${message.includes('✓') ? 'success' : 'danger'}`}>{message}</div>}

      {showForm && (
        <div className="card mb-4">
          <div className="card-header">Nueva Factura</div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Cliente</label>
                  <select
                    className="form-select"
                    value={form.usuario_id}
                    onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
                    required
                  >
                    <option value="">Selecciona cliente...</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.cuit})</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Razón Social</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.razon_social_cliente}
                    onChange={(e) => setForm({ ...form, razon_social_cliente: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Documento</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.documento_cliente}
                    onChange={(e) => setForm({ ...form, documento_cliente: e.target.value })}
                    placeholder="CUIT o DNI"
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Importe ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={form.importe}
                    onChange={(e) => setForm({ ...form, importe: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Concepto</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  required
                ></textarea>
              </div>
              <button type="submit" className="btn btn-primary">Crear Factura</button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p>Cargando...</p>
      ) : facturas.length > 0 ? (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead className="table-light">
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Importe</th>
                <th>Fecha</th>
                <th>CAE</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => (
                <tr key={f.id}>
                  <td><strong>{f.numero_factura}</strong></td>
                  <td>{f.nombre}</td>
                  <td>{f.concepto.substring(0, 30)}...</td>
                  <td>${f.importe.toLocaleString('es-AR')}</td>
                  <td>{new Date(f.creado_en * 1000).toLocaleDateString('es-AR')}</td>
                  <td><span className="badge bg-warning">{f.cae}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="alert alert-info">No hay facturas</div>
      )}
    </div>
  )
}
