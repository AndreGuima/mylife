# mylife — Frontend

Aplicação web do mylife.

## Arquitetura

O frontend é uma **SPA** (Single Page Application), sem SSR:

- O `vite build` gera arquivos estáticos (HTML, JS, CSS) em `dist/`.
- A navegação entre páginas acontece no navegador, via `BrowserRouter` do React Router ([src/main.jsx](src/main.jsx)).
- Os dados vêm do backend (FastAPI) por chamadas HTTP feitas com axios ([src/services/api.js](src/services/api.js)).

## Stack

- **React 19** com JavaScript (`.jsx`, sem TypeScript)
- **Vite 7** — dev server e build
- **React Router 7** — rotas no lado do cliente
- **Tailwind CSS 3** — estilos
- **axios** — cliente HTTP
- **lucide-react** — ícones
- **react-hot-toast** — notificações

## Estrutura

```
src/
├── pages/       # telas (uma por rota)
├── components/  # componentes reutilizáveis
├── layout/      # layout base das páginas
├── services/    # chamadas à API (um service por recurso)
├── contexts/    # contextos React (autenticação e tema)
├── core/        # tratamento de erros da API, tema e toasts
├── constants/   # constantes compartilhadas
├── utils/       # funções utilitárias
└── main.jsx     # ponto de entrada e definição das rotas
```

## Configuração

| Variável       | Descrição                                                |
| -------------- | -------------------------------------------------------- |
| `VITE_API_URL` | URL base do backend usada pelo axios. Definida no build. |

Por ser uma variável `VITE_*`, ela é embutida no bundle durante o build. Se mudar, é preciso gerar o build de novo.

## Scripts

```bash
npm run dev           # servidor de desenvolvimento (Vite)
npm run build         # build de produção em dist/
npm run preview       # serve o build localmente
npm run lint          # ESLint
npm run format        # Prettier (corrige)
npm run format:check  # Prettier (só verifica)
npm test              # testes (node --test)
```

## Como é servido em produção (Docker)

O [Dockerfile](Dockerfile) tem dois estágios:

1. **Build:** Node 20 roda `npm ci` e `npm run build`, recebendo `VITE_API_URL` como build arg.
2. **Runtime:** Nginx serve os arquivos de `dist/`.

O [nginx.conf](nginx.conf):

- devolve `index.html` para qualquer rota que não seja um arquivo (`try_files $uri /index.html`), o que é necessário para o `BrowserRouter` funcionar quando uma URL como `/login` é acessada diretamente;
- repassa `/api/*` para o container `backend:8000`, removendo o prefixo `/api`.
