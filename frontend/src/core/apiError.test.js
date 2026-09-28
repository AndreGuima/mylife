import assert from "node:assert/strict";
import test from "node:test";

import { getApiErrorMessage } from "./apiError.js";

test("getApiErrorMessage handles missing responses and API messages", () => {
  assert.equal(
    getApiErrorMessage(null),
    "Não foi possível conectar ao servidor. Verifique sua internet.",
  );
  assert.equal(
    getApiErrorMessage({ response: { data: { message: "  mensagem  " } } }),
    "  mensagem  ",
  );
  assert.equal(
    getApiErrorMessage({ response: { data: { detail: "detalhe" } } }),
    "detalhe",
  );
});

test("getApiErrorMessage maps HTTP statuses to friendly messages", () => {
  const cases = [
    [400, "Requisição inválida. Verifique os dados enviados."],
    [401, "Sua sessão expirou. Faça login novamente."],
    [403, "Você não tem permissão para executar esta ação."],
    [404, "Recurso não encontrado."],
    [409, "Conflito de dados. Esse registro já existe."],
    [422, "Dados inválidos. Verifique os campos preenchidos."],
    [429, "Muitas tentativas. Aguarde alguns instantes."],
    [500, "Erro interno no servidor. Tente novamente mais tarde."],
    [502, "Servidor temporariamente indisponível."],
    [503, "Servidor temporariamente indisponível."],
    [504, "Servidor temporariamente indisponível."],
  ];

  for (const [status, message] of cases) {
    assert.equal(
      getApiErrorMessage({ response: { status, data: {} } }),
      message,
    );
  }

  assert.equal(
    getApiErrorMessage({ response: { status: 418, data: {} } }, "fallback"),
    "fallback",
  );
});

test("getApiErrorMessage ignores blank API messages and uses the status", () => {
  assert.equal(
    getApiErrorMessage({
      response: { status: 401, data: { message: "  ", detail: "" } },
    }),
    "Sua sessão expirou. Faça login novamente.",
  );
});
