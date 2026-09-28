export default function InvestmentFilters({
  filters,
  setFilters,
  onExportCsv,
}) {
  return (
    <div className="themed-card themed-border border rounded-xl p-5 mb-4">
      <h2 className="text-xl font-semibold mb-4">Filtrar carteira</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          type="text"
          className="themed-input rounded px-3 py-2"
          placeholder="Buscar por ticker ou nome"
          value={filters.query}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, query: e.target.value }))
          }
        />

        <select
          className="themed-input rounded px-3 py-2"
          value={filters.assetType}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, assetType: e.target.value }))
          }
        >
          <option value="">Todos os tipos</option>
          <option value="stock">Ação</option>
          <option value="fii">FII</option>
        </select>

        <button
          type="button"
          onClick={() => setFilters({ query: "", assetType: "" })}
          className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
        >
          Limpar filtros
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
        >
          Exportar CSV
        </button>
      </div>
    </div>
  );
}
