#!/bin/bash
set -euo pipefail

echo "🚀 Iniciando Quality Pipeline local via Docker..."
echo ""

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ======================================
# Validações iniciais
# ======================================
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker não encontrado."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Docker Compose não encontrado."
  exit 1
fi

cd "$ROOT"

# ======================================
# Banco
# ======================================
echo "📦 Subindo banco necessário para os testes..."
docker compose up -d db

echo "⏳ Aguardando MySQL ficar disponível..."

until docker compose exec -T db \
  sh -c 'mysqladmin ping -h 127.0.0.1 -u root -p"$MYSQL_ROOT_PASSWORD" --silent' \
  >/dev/null 2>&1; do
  sleep 2
done

echo "✅ MySQL disponível"
echo ""

# ======================================
# Backend
# ======================================
echo "📦 Construindo imagem do backend..."
docker compose build backend

echo ""
echo "🐍 Validando backend..."
echo ""

docker compose run --rm \
  -v "$ROOT/backend:/app" \
  -w /app \
  backend bash -lc '
    set -e

    echo "▶️ isort"
    python -m isort --check-only . --profile black

    echo ""
    echo "▶️ Black"
    python -m black --check .

    echo ""
    echo "▶️ flake8"
    python -m flake8 .

    echo ""
    echo "▶️ pytest"
    TZ=UTC python -m pytest -v tests
  '

echo ""
echo "✅ Backend OK"
echo ""

# ======================================
# Frontend
# ======================================
echo "🌐 Validando frontend..."
echo ""

if [ -f "$ROOT/frontend/package-lock.json" ]; then
  INSTALL_CMD="npm ci"
else
  INSTALL_CMD="npm install"
fi

docker run --rm \
  -v "$ROOT/frontend:/app" \
  -w /app \
  -e CI=1 \
  node:20 bash -lc "
    set -e

    echo '▶️ Instalando dependências'
    $INSTALL_CMD

    echo ''
    echo '▶️ Prettier'
    npx prettier --check .

    echo ''
    echo '▶️ ESLint'
    npm run lint

    echo ''
    echo '▶️ Build'
    npm run build
  "

echo ""
echo "✅ Frontend OK"
echo ""

# ======================================
# Git / Versionamento
# ======================================
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "🌿 Branch atual: $BRANCH"
echo ""

echo "📋 Alterações no projeto:"
git status --short

echo ""

if git diff --quiet && git diff --cached --quiet; then
  echo "✔ Nenhuma alteração detectada."
  echo ""
  echo "🎉 Quality Gate passou com sucesso!"
  exit 0
fi

echo "⚠️ Existem alterações no projeto."
echo ""

read -r -p "📦 Adicionar todas as alterações ao staging? [y/N] " STAGE

if [[ ! "$STAGE" =~ ^[Yy]$ ]]; then
  echo ""
  echo "ℹ️ Nenhum arquivo foi adicionado ao staging."
  echo "🎉 Quality Gate passou com sucesso!"
  exit 0
fi

git add .

echo ""
echo "📋 Arquivos preparados para commit:"
git diff --cached --stat

echo ""

echo "🔎 Resumo das alterações staged:"
git status --short

echo ""

read -r -p "📝 Mensagem do commit: " MSG

if [ -z "$MSG" ]; then
  echo "❌ A mensagem do commit não pode ser vazia."
  exit 1
fi

git commit -m "$MSG"

echo ""
echo "✅ Commit criado com sucesso."
echo "🌿 Branch: $BRANCH"
echo ""

read -r -p "🚀 Fazer push para origin/$BRANCH? [y/N] " PUSH

if [[ "$PUSH" =~ ^[Yy]$ ]]; then
  git push origin "$BRANCH"
  echo ""
  echo "✅ Push realizado com sucesso!"
else
  echo ""
  echo "ℹ️ Push não realizado."
  echo "Para enviar manualmente:"
  echo "   git push origin $BRANCH"
fi

echo ""
echo "🎉 Quality check concluído com sucesso!"