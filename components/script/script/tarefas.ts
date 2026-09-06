import { treinamentosDoPasso } from '../../../data/treinamentos-por-passo';

/**
 * As tarefas de um passo do leitor "Seu script" (onda C). Cada Passo virou um movimento, no modelo das
 * trilhas personalizadas: treinamentos recomendados, o script, o guia prático quando houver e, no fim,
 * as tarefas com checkbox.
 *
 * Os ids são estáveis porque viram chave no banco (`script_tarefas.tarefa_id`, por pessoa e por versão):
 *   `assistir-<id do treinamento>` (um por treinamento recomendado do passo)
 *   `treinar-falas` · `aplicar-reuniao` · `marcar-ajustes`
 * Mudar um id aqui faz a pessoa perder o que já tinha marcado, então id novo em vez de id renomeado.
 *
 * O estado NÃO fica no navegador: quem guarda é o servidor (`PUT /api/script/versoes/:v/tarefas/...`).
 * As trilhas guardaram os checkboxes no `localStorage` e quem limpava o navegador perdia o parcial;
 * aqui a marcação sobrevive a trocar de aparelho.
 */

export interface TarefaDoPasso {
  id: string;
  texto: string;
  /** `marcar-ajustes` abre a dica dos grifos (marcar um trecho com cor no próprio script). */
  dicaGrifo?: boolean;
}

export const TAREFA_TREINAR = 'treinar-falas';
export const TAREFA_APLICAR = 'aplicar-reuniao';
export const TAREFA_AJUSTES = 'marcar-ajustes';

export const DICA_TAREFA_AJUSTES = 'Marque no próprio script: dourado para ajustar, verde para manter, vermelho para tirar.';

/** As tarefas fixas, iguais em todos os 7 passos, sempre depois das de assistir. */
const FIXAS: TarefaDoPasso[] = [
  { id: TAREFA_TREINAR, texto: 'Treinar as falas deste passo em voz alta' },
  { id: TAREFA_APLICAR, texto: 'Aplicar na próxima reunião e anotar o que aconteceu' },
  { id: TAREFA_AJUSTES, texto: 'Marcar o que funcionou e o que ajustar', dicaGrifo: true },
];

/** Tarefa de assistir a um treinamento recomendado. */
export function idDeAssistir(treinamentoId: string): string {
  return `assistir-${treinamentoId}`;
}

/** As tarefas do passo, na ordem da tela: assistir a cada treinamento, treinar, aplicar, marcar. */
export function tarefasDoPasso(passo: number): TarefaDoPasso[] {
  const assistir = treinamentosDoPasso(passo).map((t) => ({
    id: idDeAssistir(t.id),
    texto: `Assistir a "${t.titulo}"`,
  }));
  return [...assistir, ...FIXAS];
}

/** Chave do estado no front: passo + tarefa (o servidor guarda as duas colunas separadas). */
export function chaveTarefa(passo: number, tarefaId: string): string {
  return `${passo}:${tarefaId}`;
}

/** "3 de 5" do passo, a partir das chaves concluídas. */
export function contagemDoPasso(passo: number, concluidas: ReadonlySet<string>): { feitas: number; total: number } {
  const tarefas = tarefasDoPasso(passo);
  let feitas = 0;
  for (const t of tarefas) if (concluidas.has(chaveTarefa(passo, t.id))) feitas += 1;
  return { feitas, total: tarefas.length };
}
