import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bankAccountsService from "../services/bankAccountsService";
import creditCardsService from "../services/creditCardsService";
import expenseCategoriesService from "../services/expenseCategoriesService";
import expensesService from "../services/expensesService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";

const EXPENSES_PAGE_SIZE = 10;
const EXCLUDED_TOP_CATEGORY = "Pagamento de Fatura";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  const numberValue = Number(digits) / 100;
  return numberValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

function toDateInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function toDateTimeLocalValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function toTimestamp(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeDescription(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getInitialForm() {
  const now = new Date();
  return {
    value: "",
    description: "",
    categoryId: "",
    paymentMethod: "debit",
    accountId: "",
    cardId: "",
    launchDate: toDateInputValue(now),
    createdAtPreview: toDateTimeLocalValue(now),
  };
}

export default function Expenses() {
  const valueInputRef = useRef(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [savingExpense, setSavingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [removingExpenseId, setRemovingExpenseId] = useState(null);

  const [savingCard, setSavingCard] = useState(false);
  const [removingCardId, setRemovingCardId] = useState(null);
  const [editingCardId, setEditingCardId] = useState(null);
  const [cardNameInput, setCardNameInput] = useState("");

  const [savingCategory, setSavingCategory] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryNameInput, setCategoryNameInput] = useState("");

  const [form, setForm] = useState(getInitialForm);
  const [autoCategoryDisabled, setAutoCategoryDisabled] = useState(false);
  const [expensesPage, setExpensesPage] = useState(1);
  const [launchFilters, setLaunchFilters] = useState({
    query: "",
    categoryId: "",
    paymentMethod: "",
    fromDate: "",
    toDate: "",
  });
  const [launchSort, setLaunchSort] = useState({
    key: "launch_date",
    direction: "desc",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [accountsData, cardsData, categoriesData, expensesData] =
          await Promise.all([
            bankAccountsService.list({ allow_payments: true }),
            creditCardsService.list(),
            expenseCategoriesService.list(),
            expensesService.list(),
          ]);
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
        setCards(Array.isArray(cardsData) ? cardsData : []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setExpenses(Array.isArray(expensesData) ? expensesData : []);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar despesas"));
      }
    }

    loadData();
  }, []);

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses.reduce((acc, item) => {
      const launchDate = new Date(item.launch_date);
      const isSameMonth =
        launchDate.getMonth() === now.getMonth() &&
        launchDate.getFullYear() === now.getFullYear();
      return isSameMonth ? acc + Number(item.value || 0) : acc;
    }, 0);
  }, [expenses]);

  const topCategory = useMemo(() => {
    const eligibleExpenses = expenses.filter(
      (item) =>
        item.expense_category_name?.trim().toLowerCase() !==
        EXCLUDED_TOP_CATEGORY.toLowerCase(),
    );

    if (eligibleExpenses.length === 0) return "-";

    const totalsByCategory = eligibleExpenses.reduce((acc, item) => {
      const key = item.expense_category_name || "Sem categoria";
      acc[key] = (acc[key] || 0) + Number(item.value || 0);
      return acc;
    }, {});

    return Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1])[0][0];
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const normalizedQuery = launchFilters.query.trim().toLowerCase();

    return expenses.filter((expense) => {
      const matchesQuery = normalizedQuery
        ? [
            expense.description,
            expense.expense_category_name,
            expense.bank_account_name,
            expense.credit_card_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      const matchesCategory = launchFilters.categoryId
        ? String(expense.expense_category_id) === launchFilters.categoryId
        : true;

      const matchesPayment = launchFilters.paymentMethod
        ? expense.payment_method === launchFilters.paymentMethod
        : true;

      const matchesFromDate = launchFilters.fromDate
        ? expense.launch_date >= launchFilters.fromDate
        : true;

      const matchesToDate = launchFilters.toDate
        ? expense.launch_date <= launchFilters.toDate
        : true;

      return (
        matchesQuery &&
        matchesCategory &&
        matchesPayment &&
        matchesFromDate &&
        matchesToDate
      );
    });
  }, [expenses, launchFilters]);

  const sortedExpenses = useMemo(() => {
    const list = [...filteredExpenses];

    function getSortableValue(expense, key) {
      switch (key) {
        case "launch_date":
          return toTimestamp(expense.launch_date);
        case "description":
          return expense.description || "";
        case "category":
          return expense.expense_category_name || "";
        case "payment":
          return expense.payment_method === "credit" ? "Credito" : "Debito";
        case "origin":
          return expense.payment_method === "credit"
            ? expense.credit_card_name || ""
            : expense.bank_account_name || "";
        case "value":
          return Number(expense.value || 0);
        case "created_at":
          return toTimestamp(expense.created_at);
        case "actions":
          return Number(expense.id || 0);
        default:
          return "";
      }
    }

    list.sort((a, b) => {
      const aValue = getSortableValue(a, launchSort.key);
      const bValue = getSortableValue(b, launchSort.key);

      let compareResult = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        compareResult = aValue - bValue;
      } else {
        compareResult = String(aValue).localeCompare(String(bValue), "pt-BR", {
          sensitivity: "base",
        });
      }

      return launchSort.direction === "asc" ? compareResult : -compareResult;
    });

    return list;
  }, [filteredExpenses, launchSort]);

  const totalExpensePages = useMemo(
    () => Math.max(1, Math.ceil(sortedExpenses.length / EXPENSES_PAGE_SIZE)),
    [sortedExpenses.length],
  );
  const currentExpensePage = Math.min(
    Math.max(expensesPage, 1),
    totalExpensePages,
  );

  const suggestedCategoryByPrefix = useMemo(() => {
    const prefixStats = new Map();

    expenses.forEach((expense) => {
      const normalizedDescription = normalizeDescription(expense.description);
      const categoryId = String(expense.expense_category_id || "");
      if (!normalizedDescription || !categoryId) return;

      const launchDate = String(expense.launch_date || "");
      for (
        let prefixLength = 3;
        prefixLength <= normalizedDescription.length;
        prefixLength += 1
      ) {
        const prefix = normalizedDescription.slice(0, prefixLength);
        const categoryStats = prefixStats.get(prefix) || new Map();
        const current = categoryStats.get(categoryId) || {
          count: 0,
          lastDate: "",
        };

        current.count += 1;
        if (launchDate > current.lastDate) {
          current.lastDate = launchDate;
        }

        categoryStats.set(categoryId, current);
        prefixStats.set(prefix, categoryStats);
      }
    });

    const suggestions = {};
    prefixStats.forEach((categoryStats, prefix) => {
      let bestCategoryId = "";
      let bestCount = -1;
      let bestLastDate = "";

      categoryStats.forEach((stats, categoryId) => {
        const isBetter =
          stats.count > bestCount ||
          (stats.count === bestCount && stats.lastDate > bestLastDate);
        if (isBetter) {
          bestCategoryId = categoryId;
          bestCount = stats.count;
          bestLastDate = stats.lastDate;
        }
      });

      if (bestCategoryId) suggestions[prefix] = bestCategoryId;
    });

    return suggestions;
  }, [expenses]);

  const paginatedExpenses = useMemo(() => {
    const start = (currentExpensePage - 1) * EXPENSES_PAGE_SIZE;
    return sortedExpenses.slice(start, start + EXPENSES_PAGE_SIZE);
  }, [sortedExpenses, currentExpensePage]);

  const lastCreditCardId = useMemo(() => {
    const cardIds = new Set(cards.map((card) => String(card.id)));
    const lastCreditExpense = expenses
      .filter(
        (expense) =>
          expense.payment_method === "credit" &&
          expense.credit_card_id &&
          cardIds.has(String(expense.credit_card_id)),
      )
      .sort((a, b) => {
        const bTime = toTimestamp(b.created_at) || toTimestamp(b.launch_date);
        const aTime = toTimestamp(a.created_at) || toTimestamp(a.launch_date);
        return bTime - aTime;
      })[0];

    return lastCreditExpense ? String(lastCreditExpense.credit_card_id) : "";
  }, [cards, expenses]);

  function toggleLaunchSort(key) {
    setLaunchSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
    setExpensesPage(1);
  }

  function getSuggestedCategoryId(
    description,
    { ignoreAutoDisabled = false } = {},
  ) {
    if (
      editingExpenseId ||
      (!ignoreAutoDisabled && autoCategoryDisabled) ||
      form.categoryId
    ) {
      return "";
    }
    const normalizedDescription = normalizeDescription(description);
    if (normalizedDescription.length < 3) return "";

    return suggestedCategoryByPrefix[normalizedDescription] || "";
  }

  function getSortIndicator(key) {
    if (launchSort.key !== key) return "↕";
    return launchSort.direction === "asc" ? "↑" : "↓";
  }

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setForm(getInitialForm());
    setAutoCategoryDisabled(false);
  }

  function focusValueInput() {
    window.setTimeout(() => {
      valueInputRef.current?.focus();
    }, 0);
  }

  async function handleSubmitExpense(e) {
    e.preventDefault();

    const value = parseCurrencyInput(form.value);
    const description = form.description.trim();
    const categoryId = Number(form.categoryId);
    const paymentMethod = form.paymentMethod;

    if (!Number.isFinite(value) || value === 0) {
      notify.error("Informe um valor diferente de zero");
      return;
    }
    if (!description) {
      notify.error("Informe a descricao");
      return;
    }
    if (!categoryId) {
      notify.error("Selecione a categoria");
      return;
    }
    if (!form.launchDate) {
      notify.error("Informe a data do lançamento");
      return;
    }

    if (paymentMethod === "debit" && !form.accountId) {
      notify.error("Selecione a conta para pagamento em débito");
      return;
    }
    if (paymentMethod === "credit" && !form.cardId) {
      notify.error("Selecione o cartão para pagamento em crédito");
      return;
    }

    const payload = {
      value,
      description,
      expense_category_id: categoryId,
      payment_method: paymentMethod,
      bank_account_id:
        paymentMethod === "debit" ? Number(form.accountId) : null,
      credit_card_id: paymentMethod === "credit" ? Number(form.cardId) : null,
      launch_date: form.launchDate,
    };

    setSavingExpense(true);
    try {
      if (editingExpenseId) {
        const updated = await expensesService.update(editingExpenseId, payload);
        setExpenses((prev) =>
          prev.map((item) => (item.id === editingExpenseId ? updated : item)),
        );
        notify.success("Despesa atualizada");
      } else {
        const created = await expensesService.create(payload);
        setExpenses((prev) => [created, ...prev]);
        setExpensesPage(1);
        notify.success("Despesa lançada");
      }
      resetExpenseForm();
      focusValueInput();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao salvar despesa"));
    } finally {
      setSavingExpense(false);
    }
  }

  function handleEditExpense(expense) {
    setEditingExpenseId(expense.id);
    setAutoCategoryDisabled(true);
    setForm({
      value: formatCurrencyInput(Math.round(Number(expense.value || 0) * 100)),
      description: expense.description || "",
      categoryId: String(expense.expense_category_id || ""),
      paymentMethod: expense.payment_method || "debit",
      accountId: expense.bank_account_id ? String(expense.bank_account_id) : "",
      cardId: expense.credit_card_id ? String(expense.credit_card_id) : "",
      launchDate: expense.launch_date || "",
      createdAtPreview: expense.created_at
        ? toDateTimeLocalValue(new Date(expense.created_at))
        : "",
    });
  }

  async function handleRemoveExpense(expenseId) {
    setRemovingExpenseId(expenseId);
    try {
      await expensesService.remove(expenseId);
      setExpenses((prev) => prev.filter((item) => item.id !== expenseId));
      if (editingExpenseId === expenseId) {
        resetExpenseForm();
      }
      notify.success("Despesa removida");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao remover despesa"));
    } finally {
      setRemovingExpenseId(null);
    }
  }

  function handlePaymentMethodChange(method) {
    setForm((prev) => ({
      ...prev,
      paymentMethod: method,
      accountId: method === "debit" ? prev.accountId : "",
      cardId: method === "credit" ? lastCreditCardId || prev.cardId : "",
    }));
  }

  function startEditCard(card) {
    setEditingCardId(card.id);
    setCardNameInput(card.name);
  }

  function resetCardForm() {
    setEditingCardId(null);
    setCardNameInput("");
  }

  async function handleSaveCard() {
    const name = cardNameInput.trim();
    if (!name) {
      notify.error("Informe o nome do cartao");
      return;
    }

    setSavingCard(true);
    try {
      if (editingCardId) {
        const updated = await creditCardsService.update(editingCardId, {
          name,
        });
        setCards((prev) =>
          prev.map((item) => (item.id === editingCardId ? updated : item)),
        );
        notify.success("Cartao atualizado");
      } else {
        const created = await creditCardsService.create({ name });
        setCards((prev) => [created, ...prev]);
        notify.success("Cartao criado");
      }
      resetCardForm();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao salvar cartao"));
    } finally {
      setSavingCard(false);
    }
  }

  async function handleRemoveCard(cardId) {
    setRemovingCardId(cardId);
    try {
      await creditCardsService.remove(cardId);
      setCards((prev) => prev.filter((item) => item.id !== cardId));
      if (editingCardId === cardId) {
        resetCardForm();
      }
      if (form.cardId === String(cardId)) {
        setForm((prev) => ({ ...prev, cardId: "" }));
      }
      notify.success("Cartao removido");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao remover cartao"));
    } finally {
      setRemovingCardId(null);
    }
  }

  function startEditCategory(category) {
    setEditingCategoryId(category.id);
    setCategoryNameInput(category.name);
  }

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryNameInput("");
  }

  async function handleSaveCategory() {
    const name = categoryNameInput.trim();
    if (!name) {
      notify.error("Informe o nome da categoria");
      return;
    }

    setSavingCategory(true);
    try {
      if (editingCategoryId) {
        const currentCategory = categories.find(
          (item) => item.id === editingCategoryId,
        );
        const updated = await expenseCategoriesService.update(
          editingCategoryId,
          {
            name,
          },
        );
        setCategories((prev) =>
          prev.map((item) => (item.id === editingCategoryId ? updated : item)),
        );
        if (form.categoryId === String(currentCategory?.id)) {
          setForm((prev) => ({ ...prev, categoryId: String(updated.id) }));
        }
        notify.success("Categoria atualizada");
      } else {
        const created = await expenseCategoriesService.create({ name });
        setCategories((prev) => [created, ...prev]);
        notify.success("Categoria criada");
      }
      resetCategoryForm();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao salvar categoria"));
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleRemoveCategory(category) {
    setRemovingCategoryId(category.id);
    try {
      await expenseCategoriesService.remove(category.id);
      setCategories((prev) => prev.filter((item) => item.id !== category.id));
      if (editingCategoryId === category.id) {
        resetCategoryForm();
      }
      if (form.categoryId === String(category.id)) {
        setForm((prev) => ({ ...prev, categoryId: "" }));
      }
      notify.success("Categoria removida");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao remover categoria"));
    } finally {
      setRemovingCategoryId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Lançamento de Despesas</h1>
        <Link
          to="/finances"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Finanças
        </Link>
      </div>

      <p className="themed-muted mb-6">
        Registre despesas e acompanhe sua execução mensal.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Despesas do Mês</h2>
          <p className="text-2xl font-bold">{formatCurrency(monthTotal)}</p>
          <p className="themed-muted text-sm mt-1">Total lançado no período</p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Maior Categoria</h2>
          <p className="text-2xl font-bold">{topCategory}</p>
          <p className="themed-muted text-sm mt-1">
            Categoria com maior impacto
          </p>
        </div>

        <Link
          to="/finances/expenses/pay-invoice"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Pagar Fatura</h2>
          <p className="text-2xl font-bold">Pagar Fatura</p>
          <p className="themed-muted text-sm mt-1">
            Selecione gastos no credito da fatura
          </p>
        </Link>

        <Link
          to="/finances/expenses/dashboards"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Dashboards</h2>
          <p className="text-2xl font-bold">Abrir</p>
          <p className="themed-muted text-sm mt-1">
            Visualize os painéis de despesas
          </p>
        </Link>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">
          {editingExpenseId ? "Alterar Lançamento" : "Novo Lançamento"}
        </h2>

        <form
          onSubmit={handleSubmitExpense}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <input
            ref={valueInputRef}
            type="text"
            inputMode="decimal"
            className="themed-input rounded px-3 py-2"
            placeholder="Valor"
            value={form.value}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                value: formatCurrencyInput(e.target.value),
              }))
            }
          />

          <input
            type="text"
            className="themed-input rounded px-3 py-2"
            placeholder="Descricao"
            value={form.description}
            onChange={(e) => {
              const description = e.target.value;
              setAutoCategoryDisabled(false);
              setForm((prev) => ({
                ...prev,
                description,
                categoryId:
                  prev.categoryId ||
                  getSuggestedCategoryId(description, {
                    ignoreAutoDisabled: true,
                  }),
              }));
            }}
          />

          <div className="flex flex-col gap-2">
            <select
              className="themed-input rounded px-3 py-2"
              value={form.categoryId}
              onChange={(e) => {
                setAutoCategoryDisabled(true);
                setForm((prev) => ({ ...prev, categoryId: e.target.value }));
              }}
            >
              <option value="">Selecione a categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <Link
              to="/finances/expenses/categories"
              className="text-sm font-medium text-blue-500 hover:text-blue-400 transition"
            >
              + adicionar categoria
            </Link>
          </div>

          <select
            className="themed-input rounded px-3 py-2"
            value={form.paymentMethod}
            onChange={(e) => handlePaymentMethodChange(e.target.value)}
          >
            <option value="debit">Debito</option>
            <option value="credit">Credito</option>
          </select>

          {form.paymentMethod === "debit" ? (
            <select
              className="themed-input rounded px-3 py-2"
              value={form.accountId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, accountId: e.target.value }))
              }
            >
              <option value="">Selecione a conta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                className="themed-input rounded px-3 py-2"
                value={form.cardId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, cardId: e.target.value }))
                }
              >
                <option value="">Selecione o cartao</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>

              <Link
                to="/finances/credit-cards"
                className="text-sm font-medium text-blue-500 hover:text-blue-400 transition"
              >
                + adicionar cartão de crédito
              </Link>
            </div>
          )}

          <input
            type="date"
            className="themed-input rounded px-3 py-2"
            value={form.launchDate}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, launchDate: e.target.value }))
            }
          />

          <input
            type="datetime-local"
            className="themed-input rounded px-3 py-2"
            value={form.createdAtPreview}
            readOnly
            disabled
          />

          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={savingExpense}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingExpense
                ? "Salvando..."
                : editingExpenseId
                  ? "Atualizar"
                  : "Lançar despesa"}
            </button>
            <button
              type="button"
              onClick={resetExpenseForm}
              className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
            >
              Limpar
            </button>
          </div>
        </form>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">Filtrar Lançamentos</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            className="themed-input rounded px-3 py-2 md:col-span-2"
            placeholder="Buscar por descrição, categoria ou origem"
            value={launchFilters.query}
            onChange={(e) => {
              setLaunchFilters((prev) => ({ ...prev, query: e.target.value }));
              setExpensesPage(1);
            }}
          />

          <select
            className="themed-input rounded px-3 py-2"
            value={launchFilters.categoryId}
            onChange={(e) => {
              setLaunchFilters((prev) => ({
                ...prev,
                categoryId: e.target.value,
              }));
              setExpensesPage(1);
            }}
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            className="themed-input rounded px-3 py-2"
            value={launchFilters.paymentMethod}
            onChange={(e) => {
              setLaunchFilters((prev) => ({
                ...prev,
                paymentMethod: e.target.value,
              }));
              setExpensesPage(1);
            }}
          >
            <option value="">Todos os pagamentos</option>
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setLaunchFilters({
                query: "",
                categoryId: "",
                paymentMethod: "",
                fromDate: "",
                toDate: "",
              });
              setExpensesPage(1);
            }}
            className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
          >
            Limpar filtros
          </button>

          <input
            type="date"
            className="themed-input rounded px-3 py-2"
            value={launchFilters.fromDate}
            onChange={(e) => {
              setLaunchFilters((prev) => ({
                ...prev,
                fromDate: e.target.value,
              }));
              setExpensesPage(1);
            }}
          />

          <input
            type="date"
            className="themed-input rounded px-3 py-2"
            value={launchFilters.toDate}
            onChange={(e) => {
              setLaunchFilters((prev) => ({ ...prev, toDate: e.target.value }));
              setExpensesPage(1);
            }}
          />
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">Lançamentos</h2>
        {filteredExpenses.length === 0 ? (
          <p className="themed-muted">
            Nenhum lançamento encontrado para os filtros informados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b themed-border">
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("launch_date")}
                      className="font-semibold hover:opacity-80"
                    >
                      Data Lançamento {getSortIndicator("launch_date")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("description")}
                      className="font-semibold hover:opacity-80"
                    >
                      Descrição {getSortIndicator("description")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("category")}
                      className="font-semibold hover:opacity-80"
                    >
                      Categoria {getSortIndicator("category")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("payment")}
                      className="font-semibold hover:opacity-80"
                    >
                      Pagamento {getSortIndicator("payment")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("origin")}
                      className="font-semibold hover:opacity-80"
                    >
                      Origem {getSortIndicator("origin")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("value")}
                      className="font-semibold hover:opacity-80"
                    >
                      Valor {getSortIndicator("value")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("created_at")}
                      className="font-semibold hover:opacity-80"
                    >
                      Created at {getSortIndicator("created_at")}
                    </button>
                  </th>
                  <th className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLaunchSort("actions")}
                      className="font-semibold hover:opacity-80"
                    >
                      Ações {getSortIndicator("actions")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b themed-border">
                    <td className="py-2 pr-2">{expense.launch_date}</td>
                    <td className="py-2 pr-2">{expense.description}</td>
                    <td className="py-2 pr-2">
                      {expense.expense_category_name}
                    </td>
                    <td className="py-2 pr-2">
                      {expense.payment_method === "credit"
                        ? "Credito"
                        : "Debito"}
                    </td>
                    <td className="py-2 pr-2">
                      {expense.payment_method === "credit"
                        ? expense.credit_card_name
                        : expense.bank_account_name}
                    </td>
                    <td className="py-2 pr-2">
                      {formatCurrency(expense.value)}
                    </td>
                    <td className="py-2 pr-2">
                      {expense.created_at
                        ? new Date(expense.created_at).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditExpense(expense)}
                          className="px-2 py-1 text-xs rounded themed-card themed-border border hover:opacity-90"
                        >
                          Alterar
                        </button>
                        <button
                          type="button"
                          disabled={removingExpenseId === expense.id}
                          onClick={() => handleRemoveExpense(expense.id)}
                          className="px-2 py-1 text-xs rounded text-red-600 themed-card themed-border border hover:opacity-90 disabled:opacity-50"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredExpenses.length > 0 && (
          <div className="flex items-center justify-between gap-2 mt-4 text-sm">
            <button
              type="button"
              disabled={currentExpensePage <= 1}
              onClick={() => setExpensesPage((prev) => Math.max(1, prev - 1))}
              className="themed-card themed-border border px-3 py-1 rounded hover:opacity-90 disabled:opacity-50"
            >
              Anterior
            </button>
            <div className="themed-muted">
              Página {currentExpensePage} de {totalExpensePages} •{" "}
              {filteredExpenses.length} lançamento(s)
            </div>
            <button
              type="button"
              disabled={currentExpensePage >= totalExpensePages}
              onClick={() =>
                setExpensesPage((prev) => Math.min(totalExpensePages, prev + 1))
              }
              className="themed-card themed-border border px-3 py-1 rounded hover:opacity-90 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">Cartões de Crédito</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            className="themed-input rounded px-3 py-2 md:col-span-2"
            placeholder="Nome do cartao"
            value={cardNameInput}
            onChange={(e) => setCardNameInput(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingCard}
              onClick={handleSaveCard}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingCard
                ? "Salvando..."
                : editingCardId
                  ? "Atualizar"
                  : "Criar"}
            </button>
            {editingCardId && (
              <button
                type="button"
                onClick={resetCardForm}
                className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          {cards.length === 0 ? (
            <p className="themed-muted">Nenhum cartao cadastrado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="themed-card themed-border border rounded px-3 py-2 inline-flex items-center gap-3"
                >
                  <span>{card.name}</span>
                  <button
                    type="button"
                    onClick={() => startEditCard(card)}
                    className="themed-link hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={removingCardId === card.id}
                    onClick={() => handleRemoveCard(card.id)}
                    className="text-red-600 hover:underline text-sm disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">Categorias de Despesas</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            className="themed-input rounded px-3 py-2 md:col-span-2"
            placeholder="Nome da categoria"
            value={categoryNameInput}
            onChange={(e) => setCategoryNameInput(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingCategory}
              onClick={handleSaveCategory}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingCategory
                ? "Salvando..."
                : editingCategoryId
                  ? "Atualizar"
                  : "Criar"}
            </button>
            {editingCategoryId && (
              <button
                type="button"
                onClick={resetCategoryForm}
                className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          {categories.length === 0 ? (
            <p className="themed-muted">Nenhuma categoria cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="themed-card themed-border border rounded px-3 py-2 inline-flex items-center gap-3"
                >
                  <span>{category.name}</span>
                  <button
                    type="button"
                    onClick={() => startEditCategory(category)}
                    className="themed-link hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={removingCategoryId === category.id}
                    onClick={() => handleRemoveCategory(category)}
                    className="text-red-600 hover:underline text-sm disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
