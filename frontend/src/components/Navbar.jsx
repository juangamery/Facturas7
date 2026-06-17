export default function Navbar({ page, setPage }) {
  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top">
      <div className="container-fluid px-4">
        <a className="navbar-brand fw-bold" href="#" style={{ color: '#667eea' }}>
          📱 Facturación
        </a>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <div className="navbar-nav ms-auto">
            <button
              className={`nav-link btn btn-link ${page === 'dashboard' ? 'active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              📊 Dashboard
            </button>
            <button
              className={`nav-link btn btn-link ${page === 'clientes' ? 'active' : ''}`}
              onClick={() => setPage('clientes')}
            >
              👥 Clientes
            </button>
            <button
              className={`nav-link btn btn-link ${page === 'facturas' ? 'active' : ''}`}
              onClick={() => setPage('facturas')}
            >
              📄 Facturas
            </button>
            <button
              className={`nav-link btn btn-link ${page === 'comprobantes' ? 'active' : ''}`}
              onClick={() => setPage('comprobantes')}
            >
              📋 Comprobantes
            </button>
            <a className="nav-link" href="/admin/logout">🚪 Salir</a>
          </div>
        </div>
      </div>
    </nav>
  )
}
