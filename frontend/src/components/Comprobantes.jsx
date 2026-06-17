import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Comprobantes() {
  const [comprobantes, setComprobantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [razonRechazo, setRazonRechazo] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetchComprobantes()
  }, [])

  const fetchComprobantes = async () => {
    try {
      const res = await axios.get('/admin/comprobantes')
      setComprobantes(res.data.comprobantes || [])
    } catch (error) {
      setMessage('Error cargando comprobantes')
    } finally {
      setLoading(false)
    }
  }

  const aprobar = async (id) => {
    try {
      await axios.post(`/admin/comprobantes/${id}/aprobar`, {
        verificado_por: 'admin'
      })
      setMessage('✓ Comprobante aprobado')
      fetchComprobantes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Error al aprobar')
    }
  }

  const rechazar = async (id) => {
    if (!razonRechazo) {
      setMessage('Ingresa razón de rechazo')
      return
    }
    try {
      await axios.post(`/admin/comprobantes/${id}/rechazar`, {
        razon: razonRechazo,
        verificado_por: 'admin'
      })
      setMessage('✓ Comprobante rechazado')
      setRazonRechazo('')
      setSelectedId(null)
      fetchComprobantes()
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Error al rechazar')
    }
  }

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleDateString('es-AR')
  }

  return (
    <div className="container mt-4">
      <h1>📋 Comprobantes de Pago</h1>

      {message && <div className={`alert alert-${message.includes('✓') ? 'success' : 'danger'}`}>{message}</div>}

      {loading ? (
        <p>Cargando...</p>
      ) : comprobantes.length > 0 ? (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead className="table-light">
              <tr>
                <th>WhatsApp</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.map(comp => (
                <tr key={comp.id}>
                  <td>{comp.numero_whatsapp}</td>
                  <td>
                    {comp.tipo === 'imagen' && '📷'}
                    {comp.tipo === 'audio' && '🎙️'}
                    {comp.tipo === 'texto' && '📝'}
                    {' '}{comp.tipo}
                  </td>
                  <td>{formatDate(comp.creado_en)}</td>
                  <td><span className="badge bg-warning">Pendiente</span></td>
                  <td>
                    <button
                      className="btn btn-sm btn-success me-2"
                      onClick={() => aprobar(comp.id)}
                    >
                      Aprobar
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setSelectedId(comp.id)}
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
        <div className="alert alert-info">No hay comprobantes pendientes</div>
      )}

      {selectedId && (
        <div className="card mt-4">
          <div className="card-header">Rechazar comprobante</div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">Razón del rechazo</label>
              <textarea
                className="form-control"
                rows="3"
                value={razonRechazo}
                onChange={(e) => setRazonRechazo(e.target.value)}
                placeholder="Ej: Comprobante ilegible, falta información, etc"
              ></textarea>
            </div>
            <button className="btn btn-danger" onClick={() => rechazar(selectedId)}>
              Confirmar rechazo
            </button>
            <button className="btn btn-secondary ms-2" onClick={() => {
              setSelectedId(null)
              setRazonRechazo('')
            }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
