export default function Navbar({ page, setPage, onLogout }) {
  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'clientes', label: '👥 Clientes' },
    { id: 'facturas', label: '📄 Facturas' },
    { id: 'comprobantes', label: '📋 Comprobantes' },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
        <div className="text-xl font-bold text-blue-500">
          📱 Facturación
        </div>

        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPage(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                page === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={onLogout}
            className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-slate-800 transition"
          >
            🚪 Salir
          </button>
        </div>
      </div>
    </nav>
  )
}
