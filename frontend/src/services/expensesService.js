import api from "./api";

function buildExpensesQuery(filters = {}, includePagination = true) {
  const params = new URLSearchParams();

  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.month) params.set("month", String(filters.month));
  if (filters.categoryId) params.set("category_id", String(filters.categoryId));

  if (includePagination) {
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));
  }

  return params.toString();
}

const expensesService = {
  list(filters = {}) {
    const query = buildExpensesQuery(filters, true);
    return api.get(query ? `/expenses?${query}` : "/expenses");
  },

  summary(filters = {}) {
    const query = buildExpensesQuery(filters, false);
    return api.get(query ? `/expenses/summary?${query}` : "/expenses/summary");
  },

  create(payload) {
    return api.post("/expenses", payload);
  },

  createInstallments(payload) {
    return api.post("/expenses/installments", payload);
  },

  update(id, payload) {
    return api.patch(`/expenses/${id}`, payload);
  },

  remove(id) {
    return api.delete(`/expenses/${id}`);
  },

  payCreditInvoice(payload) {
    return api.post("/expenses/pay-credit-invoice", payload);
  },
};

export default expensesService;
