import api from "./api";

const creditCardsService = {
  list() {
    return api.get("/credit-cards");
  },

  create(payload) {
    return api.post("/credit-cards", payload);
  },

  update(id, payload) {
    return api.patch(`/credit-cards/${id}`, payload);
  },

  remove(id) {
    return api.delete(`/credit-cards/${id}`);
  },

  getSettings(id) {
    return api.get(`/credit-cards/${id}/settings`);
  },

  updateSettings(id, payload) {
    return api.put(`/credit-cards/${id}/settings`, payload);
  },

  getCycleDashboard(id) {
    return api.get(`/credit-cards/${id}/cycle-dashboard`);
  },
};

export default creditCardsService;
