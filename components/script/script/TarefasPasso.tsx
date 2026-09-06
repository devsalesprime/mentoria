import React from 'react';
import { DICA_TAREFA_AJUSTES, chaveTarefa, contagemDoPasso, tarefasDoPasso } from './tarefas';

/**
 * "Tarefas" no fim do movimento de cada Passo: assistir a cada treinamento recomendado, treinar as falas
 * em voz alta, aplicar na próxima reunião e marcar o que funcionou e o que ajustar (esta última traz a
 * dica dos grifos).
 *
 * O componente é controlado: quem guarda o estado é a tela (`ScriptScreen`), que marca na hora
 * (otimista) e grava em `PUT /api/script/versoes/:v/tarefas/:passo/:tarefa_id`. Sem `onTarefa`, os
 * checkboxes aparecem só para leitura.
 * Alvo de toque de 44 px na linha inteira, para funcionar no celular.
 */

export const ROTULO_TAREFAS = 'Tarefas';

/** "3 de 5 tarefas". */
export function textoContagem(feitas: number, total: number): string {
  return `${feitas} de ${total} tarefas`;
}

const IconeCheck: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

interface TarefasPassoProps {
  passo: number;
  /** Chaves `passo:tarefa_id` já concluídas por esta pessoa nesta versão. */
  concluidas: ReadonlySet<string>;
  onTarefa?: (passo: number, tarefaId: string, concluida: boolean) => void;
}

export const TarefasPasso: React.FC<TarefasPassoProps> = ({ passo, concluidas, onTarefa }) => {
  const tarefas = tarefasDoPasso(passo);
  const { feitas, total } = contagemDoPasso(passo, concluidas);
  return (
    <section className="script-no-print min-w-0 mt-6" aria-label={`${ROTULO_TAREFAS} do passo ${passo}`} data-testid="tarefas-passo">
      <div className="flex items-baseline justify-between gap-3">
        <p className="script-nota-rotulo">{ROTULO_TAREFAS}</p>
        <span className="script-tarefa-contagem" data-testid="tarefas-contagem">{textoContagem(feitas, total)}</span>
      </div>
      <ul className="space-y-0.5">
        {tarefas.map((t) => {
          const feita = concluidas.has(chaveTarefa(passo, t.id));
          return (
            <li key={t.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={feita}
                disabled={!onTarefa}
                data-testid="tarefa-item"
                data-tarefa={t.id}
                onClick={() => onTarefa && onTarefa(passo, t.id, !feita)}
                className={`script-tarefa ${feita ? 'script-tarefa-feita' : ''}`}
              >
                <span className="script-tarefa-caixa" aria-hidden="true"><IconeCheck /></span>
                <span className="min-w-0 flex-1">
                  <span className="script-tarefa-texto block">{t.texto}</span>
                  {t.dicaGrifo && <span className="script-tarefa-dica block mt-0.5">{DICA_TAREFA_AJUSTES}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default TarefasPasso;
