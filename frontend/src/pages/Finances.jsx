import { Link } from "react-router-dom";

export default function Finances() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Finanças</h1>
      <p className="themed-muted mb-8">Escolha o módulo que deseja acessar.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/finances/patrimony"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Patrimônio</div>
          <div className="themed-muted text-sm">
            Organize e acompanhe o valor do seu patrimônio.
          </div>
        </Link>

        <Link
          to="/finances/expenses"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">
            Lançamento de Despesas
          </div>
          <div className="themed-muted text-sm">
            Registre e categorize suas despesas do dia a dia.
          </div>
        </Link>

        <Link
          to="/finances/investments"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Investimentos</div>
          <div className="themed-muted text-sm">
            Visualize e acompanhe sua carteira de investimentos.
          </div>
        </Link>

        <Link
          to="/finances/entries-vs-expenses"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Entrada x Saídas</div>
          <div className="themed-muted text-sm">
            Veja o balanço diário entre entradas e saídas.
          </div>
        </Link>

        <Link
          to="/finances/transfers"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">
            Transferência entre Contas
          </div>
          <div className="themed-muted text-sm">
            Transfira valores entre suas contas bancárias com atualização de
            saldo.
          </div>
        </Link>

        <Link
          to="/dreams"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Metas e Conquistas</div>
          <div className="themed-muted text-sm">
            Acesse o gerenciamento dos seus sonhos e metas SMART.
          </div>
        </Link>

        <Link
          to="/finances/notes"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Anotações</div>
          <div className="themed-muted text-sm">
            Registre lembretes, ideias e observações financeiras.
          </div>
        </Link>

        <Link
          to="/finances/expenses/credit-card-settings"
          className="themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition"
        >
          <div className="text-lg font-semibold mb-1">Uso do Cartão</div>
          <div className="themed-muted text-sm">
            Configure vencimento, fechamento e limites e acompanhe o planejado x
            realizado.
          </div>
        </Link>
      </div>
    </div>
  );
}
