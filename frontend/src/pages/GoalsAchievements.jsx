import { Link } from "react-router-dom";

const cardClass =
  "themed-card themed-border border rounded-xl p-5 text-left hover:shadow-md transition";

export default function GoalsAchievements() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Metas e Conquistas</h1>
      <p className="themed-muted mb-8">Escolha o módulo que deseja acessar.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/dreams/goals" className={cardClass}>
          <div className="text-lg font-semibold mb-1">
            Objetivos Financeiros
          </div>
          <div className="themed-muted text-sm">
            Estruture seus objetivos, conecte hábitos e acompanhe marcos em
            timeline.
          </div>
        </Link>

        <Link to="/dreams/crossover-point" className={cardClass}>
          <div className="text-lg font-semibold mb-1">Ponto de Virada</div>
          <div className="themed-muted text-sm">
            Descubra quanto precisa ter investido hoje para que os juros
            compostos garantam sua aposentadoria sem novos aportes.
          </div>
        </Link>
      </div>
    </div>
  );
}
