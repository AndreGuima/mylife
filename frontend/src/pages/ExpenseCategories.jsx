import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import expenseCategoriesService from "../services/expenseCategoriesService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";

export default function ExpenseCategories() {
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return categories;

    return categories.filter((category) =>
      String(category.name || "")
        .toLowerCase()
        .includes(query),
    );
  }, [categories, searchQuery]);

  async function loadCategories() {
    try {
      const data = await expenseCategoriesService.list();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao carregar categorias"));
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function resetForm() {
    setName("");
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      notify.error("Informe o nome da categoria");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await expenseCategoriesService.update(editingId, {
          name: trimmedName,
        });
        setCategories((prev) =>
          prev.map((item) => (item.id === editingId ? updated : item)),
        );
        notify.success("Categoria atualizada");
      } else {
        const created = await expenseCategoriesService.create({
          name: trimmedName,
        });
        setCategories((prev) => [created, ...prev]);
        notify.success("Categoria criada");
      }
      resetForm();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao salvar categoria"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(categoryId) {
    setRemovingId(categoryId);
    try {
      await expenseCategoriesService.remove(categoryId);
      setCategories((prev) => prev.filter((item) => item.id !== categoryId));
      if (editingId === categoryId) resetForm();
      notify.success("Categoria removida");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao remover categoria"));
    } finally {
      setRemovingId(null);
    }
  }

  function startEdit(category) {
    setEditingId(category.id);
    setName(category.name || "");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-bold">Categorias de Despesas</h1>
        <Link
          to="/finances/expenses"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para lançamentos
        </Link>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da categoria"
            className="themed-input rounded px-3 py-2"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {categories.length > 0 && (
          <div className="mt-4">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar categoria..."
              aria-label="Buscar categoria"
              className="themed-input w-full rounded px-3 py-2"
            />
          </div>
        )}

        <div className="mt-6">
          {categories.length === 0 ? (
            <p className="themed-muted">Nenhuma categoria cadastrada.</p>
          ) : filteredCategories.length === 0 ? (
            <p className="themed-muted">
              Nenhuma categoria encontrada para a pesquisa.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredCategories.map((category) => (
                <div
                  key={category.id}
                  className="themed-card themed-border border rounded px-3 py-2 inline-flex items-center gap-3"
                >
                  <span>{category.name}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(category)}
                    className="themed-link hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={removingId === category.id}
                    onClick={() => handleRemove(category.id)}
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
