import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import investmentsService from "../services/investmentsService";
import { confirm, notify } from "../core/toast";
import { normalizeInvestmentSector } from "../constants/investmentSectors";
import InvestmentSummary from "./investments/components/InvestmentSummary";
import InvestmentForm from "./investments/components/InvestmentForm";
import InvestmentFilters from "./investments/components/InvestmentFilters";
import InvestmentTable from "./investments/components/InvestmentTable";

const LEGACY_INVESTMENTS_STORAGE_KEY = "myquotes_investments_v1";
const LEGACY_INVESTMENTS_IMPORTED_KEY = "myquotes_investments_v1_imported";
const LEGACY_INVESTMENTS_BACKUP_KEY = "myquotes_investments_v1_backup";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");

  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function getInitialForm() {
  return {
    assetType: "stock",
    sector: "",
    ticker: "",
    name: "",
    quantity: "",
    averagePrice: "",
  };
}

function getAssetTypeLabel(type) {
  if (type === "fii") return "FII";
  return "Ação";
}

function formatIntegerQuantity(value) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "";
  return String(Math.trunc(numberValue));
}

function loadLegacyInvestments() {
  try {
    const raw = localStorage.getItem(LEGACY_INVESTMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SORT_MAP = {
  asset_type: (item) => item.assetTypeLabel,
  sector: (item) => item.sector || "",
  ticker: (item) => item.ticker || "",
  name: (item) => item.name || "",
  quantity: (item) => item.quantityNumber,
  average_price: (item) => item.averagePriceNumber,
  current_price: (item) => item.currentPriceNumber,
  invested: (item) => item.invested,
  current: (item) => item.current,
  result: (item) => item.result,
};

export default function Investments() {
  const PAGE_SIZE = 10;
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: "ticker",
    direction: "asc",
  });

  const [form, setForm] = useState(getInitialForm);
  const [filters, setFilters] = useState({
    query: "",
    assetType: "",
  });

  const normalizedInvestments = useMemo(
    () =>
      investments.map((item) => {
        const quantity = Number(item.quantity || 0);
        const averagePrice = Number(item.average_price || 0);
        const currentPrice = Number(item.current_price || 0);
        const invested = quantity * averagePrice;
        const current = quantity * currentPrice;
        const result = current - invested;

        return {
          ...item,
          quantityNumber: quantity,
          averagePriceNumber: averagePrice,
          currentPriceNumber: currentPrice,
          invested,
          current,
          result,
          assetTypeLabel: getAssetTypeLabel(item.asset_type),
        };
      }),
    [investments],
  );

  useEffect(() => {
    async function loadData() {
      try {
        const data = await investmentsService.list();
        const apiItems = Array.isArray(data) ? data : [];

        if (apiItems.length === 0) {
          const alreadyImported =
            localStorage.getItem(LEGACY_INVESTMENTS_IMPORTED_KEY) === "1";
          const legacyItems = alreadyImported ? [] : loadLegacyInvestments();

          if (legacyItems.length > 0) {
            let importedCount = 0;

            for (const legacyItem of legacyItems) {
              try {
                await investmentsService.create({
                  asset_type: legacyItem.asset_type || "stock",
                  sector: normalizeInvestmentSector(
                    legacyItem.asset_type || "stock",
                    legacyItem.sector,
                  ),
                  ticker: String(legacyItem.ticker || "")
                    .trim()
                    .toUpperCase(),
                  name: String(legacyItem.name || "").trim(),
                  quantity: Number(legacyItem.quantity || 0),
                  average_price: Number(legacyItem.average_price || 0),
                });
                importedCount += 1;
              } catch {
                // Mantem a importacao resiliente: falhas isoladas nao bloqueiam os demais itens.
              }
            }

            if (importedCount > 0) {
              localStorage.setItem(
                LEGACY_INVESTMENTS_BACKUP_KEY,
                JSON.stringify(legacyItems),
              );
              localStorage.setItem(LEGACY_INVESTMENTS_IMPORTED_KEY, "1");
              const refreshed = await investmentsService.list();
              setInvestments(Array.isArray(refreshed) ? refreshed : []);
              notify.success(
                `${importedCount} investimento(s) importado(s) do armazenamento anterior`,
              );
              return;
            }
          }
        }

        setInvestments(apiItems);
      } catch {
        notify.error("Erro ao carregar investimentos");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const totalInvested = useMemo(
    () => normalizedInvestments.reduce((acc, item) => acc + item.invested, 0),
    [normalizedInvestments],
  );

  const totalCurrent = useMemo(
    () => normalizedInvestments.reduce((acc, item) => acc + item.current, 0),
    [normalizedInvestments],
  );

  const profitability = useMemo(() => {
    if (totalInvested <= 0) return 0;
    return ((totalCurrent - totalInvested) / totalInvested) * 100;
  }, [totalCurrent, totalInvested]);

  const filteredInvestments = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return normalizedInvestments.filter((item) => {
      const matchesType = filters.assetType
        ? item.asset_type === filters.assetType
        : true;

      const matchesQuery = normalizedQuery
        ? [item.ticker, item.name, item.sector]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      return matchesType && matchesQuery;
    });
  }, [normalizedInvestments, filters]);

  const sortedInvestments = useMemo(() => {
    const directionFactor = sortConfig.direction === "asc" ? 1 : -1;
    const getSortValue = SORT_MAP[sortConfig.key] || (() => "");

    return [...filteredInvestments].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * directionFactor;
      }

      return (
        String(aValue).localeCompare(String(bValue), "pt-BR", {
          sensitivity: "base",
        }) * directionFactor
      );
    });
  }, [filteredInvestments, sortConfig]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedInvestments.length / PAGE_SIZE),
  );
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const paginatedInvestments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedInvestments.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedInvestments]);

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    const pages = [];

    for (let p = start; p <= end; p += 1) {
      pages.push(p);
    }

    return pages;
  }, [currentPage, totalPages]);

  function setFiltersAndResetPage(nextFilters) {
    setFilters((prev) =>
      typeof nextFilters === "function" ? nextFilters(prev) : nextFilters,
    );
    setPage(1);
  }

  function handleSort(columnKey) {
    setSortConfig((prev) => {
      if (prev.key === columnKey) {
        return {
          key: columnKey,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key: columnKey,
        direction: "asc",
      };
    });
    setPage(1);
  }

  function handleExportCsv() {
    if (sortedInvestments.length === 0) {
      notify.error("Nenhum investimento para exportar");
      return;
    }

    const headers = [
      "Tipo",
      "Setor",
      "Ticker",
      "Nome",
      "Qtd",
      "Preco Medio",
      "Preco Atual",
      "Atualizado em",
      "Investido",
      "Atual",
      "Resultado",
    ];

    const rows = sortedInvestments.map((item) => [
      item.assetTypeLabel,
      item.sector || "-",
      item.ticker || "-",
      item.name || "-",
      item.quantityNumber,
      formatCurrency(item.averagePriceNumber),
      formatCurrency(item.currentPriceNumber),
      item.price_updated_at
        ? formatDateTime(item.price_updated_at)
        : "Aguardando sync",
      formatCurrency(item.invested),
      formatCurrency(item.current),
      formatCurrency(item.result),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(";"))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `investimentos-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify.success("CSV exportado");
  }

  function resetForm() {
    setForm(getInitialForm());
    setEditingId(null);
  }

  function startEditing(item) {
    setEditingId(item.id);
    setForm({
      assetType: item.asset_type || "stock",
      sector: normalizeInvestmentSector(item.asset_type, item.sector),
      ticker: String(item.ticker || ""),
      name: String(item.name || ""),
      quantity: formatIntegerQuantity(item.quantity),
      averagePrice: String(item.average_price || ""),
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const quantity = Number(form.quantity);
    const averagePrice = Number(form.averagePrice);
    const ticker = form.ticker.trim().toUpperCase();

    if (!ticker) {
      notify.error("Informe o ticker do ativo");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      notify.error("Informe uma quantidade inteira válida");
      return;
    }

    if (!Number.isFinite(averagePrice) || averagePrice < 0) {
      notify.error("Informe um preço médio válido");
      return;
    }

    const payload = {
      asset_type: form.assetType,
      sector: normalizeInvestmentSector(form.assetType, form.sector),
      ticker,
      name: form.name,
      quantity,
      average_price: averagePrice,
    };

    setSaving(true);
    try {
      if (editingId) {
        const updated = await investmentsService.update(editingId, payload);
        setInvestments((prev) =>
          prev.map((item) => (item.id === editingId ? updated : item)),
        );
        notify.success("Investimento atualizado");
      } else {
        const created = await investmentsService.create(payload);
        setInvestments((prev) => [...prev, created]);
        notify.success("Investimento cadastrado");
      }

      resetForm();
    } catch {
      notify.error("Erro ao salvar investimento");
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(id) {
    confirm({
      message: "Deseja remover este investimento?",
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
      onConfirm: async () => {
        setRemovingId(id);
        try {
          await investmentsService.remove(id);
          setInvestments((prev) => prev.filter((item) => item.id !== id));
          if (editingId === id) resetForm();
          notify.success("Investimento removido");
        } catch {
          notify.error("Erro ao remover investimento");
        } finally {
          setRemovingId(null);
        }
      },
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Investimentos</h1>
        <Link
          to="/finances"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Finanças
        </Link>
      </div>

      <p className="themed-muted mb-6">
        Cadastre suas ações e FIIs para acompanhar posição e rentabilidade.
      </p>

      <InvestmentSummary
        totalInvested={totalInvested}
        totalCurrent={totalCurrent}
        profitability={profitability}
        formatCurrency={formatCurrency}
      />

      <InvestmentForm
        editingId={editingId}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={handleSubmit}
        onCancelEdit={resetForm}
      />

      <InvestmentFilters
        filters={filters}
        setFilters={setFiltersAndResetPage}
        onExportCsv={handleExportCsv}
      />

      <InvestmentTable
        loading={loading}
        sortedInvestments={sortedInvestments}
        paginatedInvestments={paginatedInvestments}
        sortConfig={sortConfig}
        onSort={handleSort}
        onEdit={startEditing}
        onRemove={handleRemove}
        removingId={removingId}
        formatCurrency={formatCurrency}
        currentPage={currentPage}
        totalPages={totalPages}
        visiblePageNumbers={visiblePageNumbers}
        onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        onGoToPage={setPage}
        formatDateTime={formatDateTime}
      />
    </div>
  );
}
