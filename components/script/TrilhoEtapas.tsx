import React from 'react';
import type { ScriptFichaData } from '../../hooks/useScriptFicha';
import { ehEssencial } from '../../data/script-ficha-fields';

/**
 * Trilho das etapas do Script 7 Passos (onda I, item I2): Como funciona · Escolha · Materiais · Ficha · Script.
 *
 * Responde ao "onde eu estou e o que falta" que hoje so existia como bolinha colorida no menu:
 *   etapa atual em navy (cartao cheio, com a borda dourada) · feitas em verde discreto · a proxima em creme.
 * Cada etapa leva uma linha de "o que falta", com numero quando ele existe de verdade
 * (ex.: "9 para confirmar, 3 para você", contados na propria ficha).
 *
 * No celular ele substitui as bolinhas do menu (o Dashboard esconde os pontos das etapas do script);
 * no desktop os dois convivem. Clicar leva para a etapa; a Escolha so e clicavel enquanto ninguem escolheu
 * o caminho (o "aprofundar para o completo" continua onde sempre esteve, dentro da ficha).
 */

export type EstadoEtapa = 'feita' | 'atual' | 'proxima' | 'futura';

export interface EtapaTrilho {
  /** id do modulo do Dashboard (script_como_funciona, script_escolha, ...). */
  id: string;
  nome: string;
  estado: EstadoEtapa;
  /** Uma linha de "o que falta"; vazia quando nao ha nada honesto a dizer. */
  falta: string;
  clicavel: boolean;
}

export const ETAPAS_TRILHO: Array<{ id: string; nome: string }> = [
  { id: 'script_como_funciona', nome: 'Como funciona' },
  { id: 'script_escolha', nome: 'Escolha' },
  { id: 'script_materiais', nome: 'Materiais' },
  { id: 'script_ficha', nome: 'Ficha' },
  { id: 'script_script', nome: 'Script' },
];

/** A espera antes da ficha (item I5) vive dentro da etapa da Ficha. */
const ETAPA_DE = (modulo: string): string => (modulo === 'script_espera' ? 'script_ficha' : modulo);

type Dados = Partial<ScriptFichaData> | null | undefined;

/**
 * Quantas respostas a ficha ainda espera: `confirmar` = a IA sugeriu e ninguem decidiu ainda;
 * `voce` = obrigatorias (ou essenciais, no caminho essencial) sem sugestao e sem resposta.
 */
export function contagemDaFicha(d: Dados): { confirmar: number; voce: number } {
  const campos = (d?.blocos || []).flatMap((b) => b.campos);
  const doModo = d?.modo === 'essencial' ? campos.filter(ehEssencial) : campos;
  const confirmar = doModo.filter((c) => c.status === 'sugerido' && !!(c.sugerido || '').trim()).length;
  const voce = doModo.filter((c) => !c.decidido && !(c.sugerido || '').trim() && (d?.modo === 'essencial' ? true : c.obrigatorio)).length;
  return { confirmar, voce };
}

function faltaDaFicha(d: Dados): string {
  if (d?.ficha_status === 'confirmada') return 'Ficha fechada';
  const { confirmar, voce } = contagemDaFicha(d);
  const partes: string[] = [];
  if (confirmar > 0) partes.push(`${confirmar} para confirmar`);
  if (voce > 0) partes.push(`${voce} para você`);
  if (partes.length) return partes.join(', ');
  return 'Confira o que encontramos';
}

function faltaDoScript(d: Dados): string {
  const s = d?.script;
  if (s?.aprovada) return 'Aprovado';
  if ((s?.versoes || 0) > 0) return 'Pronto para ler';
  if (s?.job && (s.job.status === 'queued' || s.job.status === 'running')) return 'Sendo escrito';
  return 'Sai depois da ficha';
}

function faltaDosMateriais(d: Dados): string {
  if (d?.materials_status === 'submitted') return 'Enviados';
  if (d?.materials_status === 'skipped') return 'Você seguiu sem materiais';
  return 'Envie o que tiver';
}

/** Qual a etapa "corrente" quando a pessoa esta olhando outra coisa (define o que e proxima e o que e futura). */
function indiceDoFluxo(d: Dados): number {
  if (!d?.visto_como_funciona) return 0;
  if (!d?.modo) return 1;
  if (d.materials_status !== 'submitted' && d.materials_status !== 'skipped') return 2;
  if (d.ficha_status !== 'confirmada') return 3;
  return 4;
}

/** O trilho inteiro, ja com estado, linha do que falta e se da para clicar. */
export function etapasDoTrilho(d: Dados, moduloAtual: string): EtapaTrilho[] {
  const atualId = ETAPA_DE(moduloAtual);
  const iAtual = ETAPAS_TRILHO.findIndex((e) => e.id === atualId);
  const iFluxo = indiceDoFluxo(d);
  const feita = [
    !!d?.visto_como_funciona,
    !!d?.modo,
    d?.materials_status === 'submitted' || d?.materials_status === 'skipped',
    d?.ficha_status === 'confirmada',
    !!d?.script?.aprovada,
  ];
  const faltas = [
    d?.visto_como_funciona ? 'Leia quando quiser' : 'Comece por aqui',
    d?.modo === 'essencial' ? 'Caminho essencial' : d?.modo === 'completo' ? 'Caminho completo' : 'Escolha o caminho',
    faltaDosMateriais(d),
    faltaDaFicha(d),
    faltaDoScript(d),
  ];
  const referencia = iAtual >= 0 ? iAtual : iFluxo;
  return ETAPAS_TRILHO.map((e, i) => {
    let estado: EstadoEtapa;
    if (i === iAtual) estado = 'atual';
    else if (feita[i]) estado = 'feita';
    else if (i === referencia + 1) estado = 'proxima';
    else estado = 'futura';
    // A Escolha so abre enquanto ninguem escolheu; depois o caminho de volta nao e oferecido
    const clicavel = e.id === 'script_escolha' ? !d?.modo : feita[i] || i <= referencia + 1;
    return { id: e.id, nome: e.nome, estado, falta: faltas[i], clicavel };
  });
}

const CLASSE: Record<EstadoEtapa, string> = {
  atual: 'bg-prosperus-navy-panel border-prosperus-gold-dark text-white',
  feita: 'bg-transparent border-green-400/40 text-green-300/90',
  proxima: 'bg-prosperus-neutral-white/95 border-prosperus-neutral-white text-prosperus-navy',
  futura: 'bg-transparent border-white/10 text-white/40',
};

const ROTULO_ESTADO: Record<EstadoEtapa, string> = {
  atual: 'etapa atual',
  feita: 'etapa concluída',
  proxima: 'próxima etapa',
  futura: 'etapa seguinte',
};

interface TrilhoEtapasProps {
  data: Dados;
  /** Modulo aberto agora (script_como_funciona, script_escolha, script_materiais, script_espera, ...). */
  atual: string;
  onNavigate?: (id: string) => void;
}

export const TrilhoEtapas: React.FC<TrilhoEtapasProps> = ({ data, atual, onNavigate }) => {
  if (!data) return null;
  const etapas = etapasDoTrilho(data, atual);
  return (
    <nav aria-label="Etapas do Script 7 Passos" className="mb-4" data-testid="trilho-etapas">
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        {etapas.map((e) => {
          const conteudo = (
            <>
              <span className="block text-[11px] uppercase tracking-wider font-sans truncate">{e.nome}</span>
              {e.falta && <span className="block text-[11px] font-sans leading-snug opacity-80">{e.falta}</span>}
              <span className="sr-only">{ROTULO_ESTADO[e.estado]}</span>
            </>
          );
          const classe = `w-full text-left rounded-lg border px-2.5 py-2 min-h-[44px] transition ${CLASSE[e.estado]}`;
          return (
            <li key={e.id} data-testid={`trilho-${e.id}`} data-estado={e.estado} className="min-w-0">
              {e.clicavel && onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate(e.id)}
                  aria-current={e.estado === 'atual' ? 'step' : undefined}
                  className={`${classe} hover:border-prosperus-gold-dark/60`}
                >
                  {conteudo}
                </button>
              ) : (
                <div className={classe} aria-current={e.estado === 'atual' ? 'step' : undefined}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default TrilhoEtapas;
