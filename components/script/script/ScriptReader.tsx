import React, { useEffect, useRef, useState } from 'react';
import type { ScriptDoc } from './parseScript';
import { documentoDe } from './parseScript';
import { comTags } from './ScriptPaper';
import { PassoSecoes, PreparacaoCartao } from './secoes';
import { AulaDani } from './AulaDani';
import { AULA_7_PASSOS } from '../../../data/aula-7-passos';
import { TreinamentosPasso } from './TreinamentosPasso';
import { TarefasPasso } from './TarefasPasso';
import { contagemDoPasso } from './tarefas';
import {
  TOTAL_NAV, NAV_INICIO, NAV_PASSO_1, NAV_PREPARACAO,
  TELA_SUMARIO, TELA_PREPARACAO,
  conteudoDaNav, ehTelaDeInicio, ehTelaDePasso, passoNaTela, rotuloNav, nomeNav, type DocumentoId,
} from './telas';

/**
 * O leitor em telas de "Seu script": 0 Inicio (introducao + sumario) · 1..7 um passo por tela ·
 * 8 Preparacao e metricas. O `tela` que entra aqui e o indice de NAVEGACAO; `data-tela` continua sendo a
 * coordenada de CONTEUDO (0..9), que e a que os grifos e os comentarios guardam (ver telas.ts).
 *
 * Onda J (SPEC-workflow-v4-decisoes-08-09, itens 9, 10, 11 e 23):
 * - tela 0 unica: "O seu script está pronto", como navegar, como grifar, como pedir ajustes, o que vem depois
 *   e, na sequencia, o sumario inteiro (os 3 blocos, os 7 passos, a aula da Dani e a premissa);
 * - "Como usar este script" fecha a tela 0 como bloco recolhido;
 * - o Cartao de bolso deixou de ter tela; "Baixar a preparação" toma o lugar de "Baixar cartão".
 *
 * Onda E4 (pedidos do dono em 07/09):
 * - RODAPE de navegacao no fim de TODA tela ("Anterior" e "Próximo: <nome da próxima tela>"), para ninguem
 *   precisar voltar ao topo; na ultima tela o "Próximo" vira "Ir para as ações".
 *
 * Onda E1 (SPEC-workflow-v3-decisoes-07-09 §2):
 * - a escolha Treinamento | Campo saiu de dentro do passo e virou global, na barra de cima da tela (ScriptScreen);
 *   aqui ela chega pronta em `documento`. Na vista Campo o leitor esconde os treinamentos e o "Por que funciona"
 *   das falas: fica so o que o vendedor usa na reuniao;
 * - a navegacao (mapa Início · 1 a 7 · Preparação) fica numa barra so: grudada no ALTO no desktop e no
 *   RODAPE no celular (a ordem visual e do CSS, `.script-barra`), sempre com Anterior e Proximo e as setas do teclado;
 * - a barra nao tem mais "Aula" nem "Grifos": a aula macro vive so no Inicio e a lista de grifos abre num botao
 *   flutuante (em todos os tamanhos, desde a onda J);
 * - os treinamentos foram para o FIM da tela do passo, depois das tarefas;
 * - "Ações" (aprovar, pedir nova versao, escrever do zero e a apresentacao) fica no FIM de tudo, depois do Passo 7,
 *   na tela de Preparacao.
 *
 * Cada tela leva `data-tela` e `data-documento` para a ancora dos grifos. Sem estado de rede: recebe tudo pronto.
 */

/** Valores da ficha que o sumario mostra quando o cabecalho do script nao os traz. */
export interface FichaResumo { oferta?: string; promessa?: string; quemConduz?: string; paraQuem?: string; }

/**
 * Apresentacao comercial (PPTX). Onda E1, item 1: o bloco sai do Cartao de bolso e vai para o "Ações", no fim.
 *   'pronta'  -> "Baixar apresentação (PPTX)" + como usar (+ os outros arquivos, quando existirem)
 *   'montando'-> "Apresentação sendo montada" (job `slides` na fila ou rodando)
 *   'ausente' -> "Gerar apresentação"
 */
export type EstadoApresentacao = 'pronta' | 'montando' | 'ausente';
export interface ApresentacaoCartao {
  estado: EstadoApresentacao;
  onBaixar?: () => void;
  onGerar?: () => void;
  gerando?: boolean;
  /** Outros arquivos da apresentacao ja publicados (o PDF para ver e as notas do apresentador). */
  outros?: Array<{ campo: string; rotulo: string; onAbrir: () => void }>;
}

export const COPY_PPTX_BAIXAR = 'Baixar apresentação (PPTX)';
export const COPY_PPTX_MONTANDO = 'Apresentação sendo montada';
export const COPY_PPTX_GERAR = 'Gerar apresentação';
export const COPY_PPTX_COMO_USAR = 'Abra no PowerPoint, escolha Modo de apresentador e conecte uma segunda tela: os slides vão para o cliente e o roteiro do script fica com você, nas notas.';
/** Onda J (item 23): o download deixou de ser o cartao de bolso e passou a ser a Preparação. */
export const COPY_BAIXAR_PREPARACAO = 'Baixar a preparação';
export const ROTULO_ACOES = 'Ações';

/** Uma rodada de ajustes por clube (onda E4). O servidor manda `ajustes_usados` e `ajustes_limite` na ficha. */
export interface AjustesInfo { usados: number; limite: number }
export const COPY_AJUSTES_SOBRANDO = 'Você tem uma rodada de ajustes incluída.';
export const COPY_AJUSTES_USADOS = 'A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.';

interface ScriptReaderProps {
  doc: ScriptDoc;
  clubNome: string;
  /** Indice de NAVEGACAO: 0 Inicio (introducao + sumario) · 1..7 Passos · 8 Preparacao. */
  tela: number;
  onTela: (t: number) => void;
  /** Numero da versao aberta, para a linha de abertura da tela de Inicio. */
  versao?: number | null;
  /** Rodada de ajustes: a tela de Inicio conta o que sobrou. */
  ajustes?: AjustesInfo;
  documento: DocumentoId;
  /** Telas com grifo ou comentario (ponto no mapa). */
  marcadas: Set<number>;
  comentariosDo: (passo: number) => React.ReactNode;
  ficha?: FichaResumo;
  /** "Baixar a preparação": a Preparação vira imagem (PNG). Sem ela, o botão não aparece (amostra). */
  onBaixarPreparacao?: () => void;
  /** Apresentação comercial (PPTX), no bloco "Ações" do fim. */
  apresentacao?: ApresentacaoCartao;
  /** Botoes de decisao (aprovar, pedir nova versao, escrever do zero), no bloco "Ações" do fim. */
  acoes?: React.ReactNode;
  totalGrifos: number;
  onAbrirGrifos?: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** Tarefas ja concluidas por esta pessoa nesta versao (chave `passo:tarefa_id`). */
  tarefasConcluidas?: ReadonlySet<string>;
  /** Marcar ou desmarcar uma tarefa; sem ela os checkboxes ficam so para leitura. */
  onTarefa?: (passo: number, tarefaId: string, concluida: boolean) => void;
  /**
   * Modo amostra (onda I, item A1): o leitor abre o script de exemplo configurado pelo admin.
   * Conteudo e navegacao inteiros; nada de grifo, comentario, tarefa nem acao. Quem chama nao passa
   * `acoes`, `apresentacao`, `onBaixarPreparacao` nem `onAbrirGrifos`; esta marca tira o resto (a dica do
   * grifo, os checkboxes das tarefas, os contadores de tarefa e a introducao do script proprio).
   */
  amostra?: boolean;
}

const SEM_TAREFAS: ReadonlySet<string> = new Set<string>();

const DICA_GRIFO = 'script-dica-grifo';

function lerFlag(chave: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(chave);
  } catch { return null; }
}
function guardarFlag(chave: string, valor: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(chave, valor);
  } catch { /* sem armazenamento */ }
}

/** Os 3 blocos da conversa; `nav` e a tela de NAVEGACAO do primeiro passo de cada bloco. */
const BLOCOS = [
  { nome: 'Conexão', passos: 'Passo 1', nav: 1 },
  { nome: 'Investigação', passos: 'Passo 2', nav: 2 },
  { nome: 'Solução', passos: 'Passos 3 a 7', nav: 3 },
];

function nomeDoPassoEm(doc: ScriptDoc, n: number): string {
  for (const d of doc.documentos) {
    const p = d.passos.find((x) => x.n === n);
    if (p) return p.nome;
  }
  return '';
}

/** Bloco da apresentacao comercial dentro de "Ações": o PPTX com o roteiro nas notas. */
const BlocoApresentacao: React.FC<{ apresentacao: ApresentacaoCartao }> = ({ apresentacao }) => (
  <section className="script-no-print script-acoes-apresentacao" aria-label="Apresentação comercial" data-testid="cartao-apresentacao">
    <p className="script-nota-rotulo">Apresentação comercial</p>
    {apresentacao.estado === 'pronta' ? (
      <>
        <button type="button" onClick={apresentacao.onBaixar} className="script-acao script-acao-forte" data-testid="cartao-pptx-baixar">
          {COPY_PPTX_BAIXAR}
        </button>
        {(apresentacao.outros || []).map((o) => (
          <button key={o.campo} type="button" onClick={o.onAbrir} className="script-acao" data-testid={`slides-${o.campo}`}>
            {o.rotulo}
          </button>
        ))}
        <p className="script-acoes-nota" data-testid="cartao-pptx-como-usar">{COPY_PPTX_COMO_USAR}</p>
      </>
    ) : apresentacao.estado === 'montando' ? (
      <p className="script-acoes-nota" data-testid="cartao-pptx-montando">{COPY_PPTX_MONTANDO}</p>
    ) : (
      <>
        <button
          type="button"
          onClick={apresentacao.onGerar}
          disabled={apresentacao.gerando}
          className="script-acao"
          data-testid="cartao-pptx-gerar"
        >
          {COPY_PPTX_GERAR}
        </button>
        <p className="script-acoes-nota">Os slides saem com as falas do script nas notas do apresentador.</p>
      </>
    )}
  </section>
);

/** "Ações": o fim de tudo, depois do Passo 7 e da Preparação. */
const BlocoAcoes: React.FC<{ acoes?: React.ReactNode; apresentacao?: ApresentacaoCartao }> = ({ acoes, apresentacao }) => {
  if (!acoes && !apresentacao) return null;
  return (
    <section className="script-acoes-fim script-no-print" aria-label={ROTULO_ACOES} data-testid="acoes-fim">
      <p className="script-nota-rotulo">{ROTULO_ACOES}</p>
      {acoes && <div className="script-acoes-linha">{acoes}</div>}
      {apresentacao && <BlocoApresentacao apresentacao={apresentacao} />}
    </section>
  );
};

/** As 3 cores do grifo, em chip, na tela de Inicio: o mesmo vocabulario do balao e do painel. */
const CHIPS_GRIFO: Array<{ cor: string; rotulo: string; para: string }> = [
  { cor: 'dourado', rotulo: 'Dourado', para: 'ajustar' },
  { cor: 'verde', rotulo: 'Verde', para: 'manter' },
  { cor: 'vermelho', rotulo: 'Vermelho', para: 'tirar' },
];

/** Introdução da tela 0: o script está pronto, como andar por ele, como grifar e como pedir os ajustes. */
const IntroDoScript: React.FC<{ clubNome: string; versao?: number | null; ajustes?: AjustesInfo }> = ({ clubNome, versao, ajustes }) => {
  const sobrando = !ajustes || ajustes.usados < ajustes.limite;
  return (
    <>
      <header className="script-titulo">
        <p className="text-[11px] uppercase tracking-[0.24em] text-prosperus-gold-dark font-semibold">
          {clubNome}{versao ? ` · v${versao}` : ''}
        </p>
        <h2 className="script-h1 font-serif text-3xl sm:text-[2.2rem] leading-tight text-prosperus-navy-panel mt-1">O seu script está pronto</h2>
        <p className="script-tela-intro mt-2">
          Ele foi escrito a partir dos seus materiais e das suas respostas. Leia com calma, marque o que quiser mudar e peça os ajustes antes de gerar a apresentação.
        </p>
        <div className="script-rule mt-4" aria-hidden="true" />
      </header>

      <section aria-label="Como usar">
        <p className="script-nota-rotulo">Como usar</p>
        <div className="script-inicio-cards">
          <article className="script-inicio-card">
            <h3 className="font-serif text-xl text-prosperus-navy-panel">Navegue</h3>
            <p className="text-sm leading-relaxed text-prosperus-neutral-black" data-testid="inicio-navegue">
              São nove telas: esta, um passo por vez e a preparação no fim. Ande com Anterior e Próximo, no fim de cada tela, ou toque no número do passo na barra. Em cima você escolhe entre Treinamento e Campo.
            </p>
          </article>
          <article className="script-inicio-card">
            <h3 className="font-serif text-xl text-prosperus-navy-panel">Grife</h3>
            <p className="text-sm leading-relaxed text-prosperus-neutral-black">
              Selecione um trecho e escolha a cor. Pode anexar um áudio, uma foto, um link ou uma nota para explicar o que você quer.
            </p>
            <ul className="script-inicio-chips" data-testid="chips-grifo">
              {CHIPS_GRIFO.map((c) => (
                <li key={c.cor} className={`script-inicio-chip script-inicio-chip-${c.cor}`}>
                  <span className={`script-grifo-bolinha script-grifo-bolinha-${c.cor}`} aria-hidden="true" />
                  {c.rotulo} para {c.para}
                </li>
              ))}
            </ul>
          </article>
          <article className="script-inicio-card">
            <h3 className="font-serif text-xl text-prosperus-navy-panel">Peça ajustes</h3>
            <p className="text-sm leading-relaxed text-prosperus-neutral-black">
              Os seus comentários e grifos viram uma versão nova do script.
            </p>
            <p className="text-sm leading-relaxed font-semibold text-prosperus-navy-panel" data-testid="inicio-ajustes">
              {sobrando ? COPY_AJUSTES_SOBRANDO : COPY_AJUSTES_USADOS}
            </p>
          </article>
        </div>
      </section>

      <section aria-label="O que vem depois" className="script-inicio-depois">
        <p className="script-nota-rotulo">O que vem depois</p>
        <p className="text-sm leading-relaxed text-prosperus-neutral-black">
          Depois que você validar o script, a gente gera a sua apresentação comercial: os slides para a reunião com o cliente, com as falas nas notas do apresentador.
        </p>
      </section>
    </>
  );
};

export const COPY_AMOSTRA_TITULO = 'Um script completo, de ponta a ponta';
export const COPY_AMOSTRA_INTRO =
  'Este é o script de outro clube, publicado como exemplo. Navegue pelas telas para ver o resumo, os 7 passos e a preparação. O seu vai sair com a sua voz, os seus números e o seu método.';

/** Introdução da tela 0 no modo amostra: sem grifo, sem rodada de ajustes, sem promessa de nada. */
const IntroDaAmostra: React.FC<{ clubNome: string }> = ({ clubNome }) => (
  <header className="script-titulo" data-testid="intro-amostra">
    <p className="text-[11px] uppercase tracking-[0.24em] text-prosperus-gold-dark font-semibold">{clubNome}</p>
    <h2 className="script-h1 font-serif text-3xl sm:text-[2.2rem] leading-tight text-prosperus-navy-panel mt-1">{COPY_AMOSTRA_TITULO}</h2>
    <p className="script-tela-intro mt-2">{COPY_AMOSTRA_INTRO}</p>
    <div className="script-rule mt-4" aria-hidden="true" />
  </header>
);

/**
 * Rodape de navegacao (onda E4): fica no FIM do conteudo de toda tela, para ninguem precisar voltar ao topo
 * para avancar. Na ultima tela o "Próximo" vira "Ir para as ações" e rola ate o bloco de decisao.
 */
const RodapeNav: React.FC<{ tela: number; onTela: (t: number) => void; nomeProxima: string; amostra?: boolean }> = ({ tela, onTela, nomeProxima, amostra = false }) => {
  const ultima = tela >= TOTAL_NAV - 1;
  const irParaAcoes = () => {
    if (typeof document === 'undefined') return;
    const alvo = document.querySelector<HTMLElement>('[data-testid="acoes-fim"]');
    if (alvo && typeof alvo.scrollIntoView === 'function') {
      try { alvo.scrollIntoView({ block: 'start' }); } catch { /* jsdom */ }
    }
  };
  return (
    <nav className="script-rodape-nav script-no-print" aria-label="Navegação no fim da tela" data-testid="rodape-nav">
      <button
        type="button"
        onClick={() => onTela(tela - 1)}
        disabled={tela <= NAV_INICIO}
        className="script-rodape-btn"
        data-testid="rodape-anterior"
      >
        Anterior
      </button>
      {ultima && amostra ? null : ultima ? (
        <button type="button" onClick={irParaAcoes} className="script-rodape-btn script-rodape-btn-forte" data-testid="rodape-proximo">
          Ir para as ações
        </button>
      ) : (
        <button type="button" onClick={() => onTela(tela + 1)} className="script-rodape-btn script-rodape-btn-forte" data-testid="rodape-proximo">
          Próximo: {nomeProxima}
        </button>
      )}
    </nav>
  );
};

/** Chip "x/y" das tarefas de um passo, no resumo da tela 0. Fica dourado cheio quando o passo esta completo. */
const ChipTarefas: React.FC<{ passo: number; concluidas: ReadonlySet<string> }> = ({ passo, concluidas }) => {
  const { feitas, total } = contagemDoPasso(passo, concluidas);
  if (!total) return null;
  return (
    <span
      className={`script-chip-tarefas ${feitas >= total ? 'script-chip-tarefas-cheio' : ''}`}
      data-testid="chip-tarefas"
      data-passo={passo}
      aria-label={`Passo ${passo}: ${feitas} de ${total} tarefas`}
    >
      {feitas}/{total}
    </span>
  );
};

interface TelaInicioProps {
  doc: ScriptDoc;
  clubNome: string;
  versao?: number | null;
  ajustes?: AjustesInfo;
  ficha?: FichaResumo;
  onTela: (t: number) => void;
  comentarios: React.ReactNode;
  tarefasConcluidas: ReadonlySet<string>;
  amostra?: boolean;
}

/**
 * Tela 0 (onda J, item 9): a introdução e o resumo do script na MESMA tela. Em cima, o que é e como usar;
 * embaixo, os 3 blocos da conversa, os 7 passos e a aula da Dani (a premissa REP mudou para o Passo 2, item
 * 19, e não se repete aqui). "Como usar este script" fecha
 * a tela como bloco recolhido (item 11: o conteúdo não muda, só deixa de competir com a introdução).
 * `data-tela` é o do sumário: o grifo desta tela continua nascendo com o mesmo passo de antes.
 */
const TelaInicio: React.FC<TelaInicioProps> = ({ doc, clubNome, versao, ajustes, ficha, onTela, comentarios, tarefasConcluidas, amostra = false }) => {
  const tem = (re: RegExp) => doc.cabecalho.some((c) => re.test(c.rotulo));
  const extras: { rotulo: string; valor: string }[] = [];
  if (ficha?.paraQuem && !tem(/para quem/i)) extras.push({ rotulo: 'Para quem este script vende', valor: ficha.paraQuem });
  if (ficha?.oferta && !tem(/o que (eu )?vend/i)) extras.push({ rotulo: 'O que vende', valor: ficha.oferta });
  if (ficha?.quemConduz && !tem(/quem conduz/i)) extras.push({ rotulo: 'Quem conduz', valor: ficha.quemConduz });
  if (ficha?.promessa && !tem(/promessa/i)) extras.push({ rotulo: 'Promessa', valor: ficha.promessa });
  const cabecalho = [...doc.cabecalho, ...extras];
  const d1 = doc.documentos[0];
  const passos = d1 ? d1.passos : [];
  const multiplos = doc.documentos.length > 1;
  const temPreparacao = !!doc.mapa || doc.documentos.some((d) => d.extras.some((e) => e.titulo !== 'Abertura'));

  return (
    <div data-tela={TELA_SUMARIO} data-documento="treinamento" className="script-inicio space-y-7" data-testid="tela-inicio">
      {amostra ? <IntroDaAmostra clubNome={clubNome} /> : <IntroDoScript clubNome={clubNome} versao={versao} ajustes={ajustes} />}

      <div className="script-inicio-botoes">
        <button type="button" onClick={() => onTela(NAV_PASSO_1)} className="script-acao script-acao-forte" data-testid="inicio-passo-1">
          Ir para o Passo 1
        </button>
        {temPreparacao && (
          <button type="button" onClick={() => onTela(NAV_PREPARACAO)} className="script-acao" data-testid="inicio-preparacao">
            Ver a preparação
          </button>
        )}
      </div>

      <section aria-label="O script, em resumo" className="space-y-6">
        <div>
          <p className="script-nota-rotulo">O script, em resumo</p>
          <h3 className="script-h2 font-serif text-2xl sm:text-[1.7rem] leading-tight text-prosperus-navy-panel">Script dos 7 passos da venda</h3>
          {doc.oferta && <p className="font-serif text-lg text-prosperus-navy-panel/80 mt-1">{doc.oferta}</p>}
        </div>

        {cabecalho.length > 0 && (
          <dl className="script-cabecalho grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cabecalho.map((c, i) => (
              <div key={i}>
                <dt className="script-nota-rotulo">{c.rotulo}</dt>
                <dd className="text-[0.95rem] leading-relaxed text-prosperus-neutral-black">{comTags(c.valor)}</dd>
              </div>
            ))}
          </dl>
        )}

        <section aria-label="Os 3 blocos da conversa">
          <p className="script-nota-rotulo">Os 3 blocos da conversa</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {BLOCOS.map((b) => (
              <button key={b.nome} type="button" onClick={() => onTela(b.nav)} className="script-bloco-card">
                <span className="font-serif text-xl text-prosperus-navy-panel">{b.nome}</span>
                <span className="text-xs text-prosperus-navy-panel/60">{b.passos}</span>
              </button>
            ))}
          </div>
        </section>

        {passos.length > 0 && (
          <section aria-label="Os 7 passos">
            <p className="script-nota-rotulo">Os 7 passos, um por tela</p>
            <ol className="space-y-1.5">
              {passos.map((p) => {
                const objetivo = p.blocos.find((b) => b.tipo === 'objetivo');
                return (
                  <li key={p.n}>
                    <button type="button" onClick={() => onTela(p.n)} className="script-passo-linha" aria-label={`Ir para o passo ${p.n}: ${p.nome}`}>
                      <span className="script-num" aria-hidden="true">{p.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[1.1rem] leading-snug text-prosperus-navy-panel">{p.nome}</span>
                        {objetivo && <span className="block text-sm text-prosperus-navy-panel/70 leading-snug">{comTags(objetivo.inline || objetivo.itens.join(' '))}</span>}
                      </span>
                      {!amostra && <ChipTarefas passo={p.n} concluidas={tarefasConcluidas} />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <AulaDani aula={AULA_7_PASSOS} />
      </section>

      <details className="script-como-usar script-recolhido" data-testid="como-usar">
        <summary className="script-recolhido-titulo">Como usar este script</summary>
        <div className="mt-3">
          {multiplos ? (
            <div className="grid gap-3 sm:grid-cols-2 mb-2">
              <div>
                <p className="font-serif text-lg text-prosperus-navy-panel">Treinamento</p>
                <p className="text-sm leading-relaxed text-prosperus-neutral-black">Leia antes da reunião. Em cada passo: objetivo, estado do cliente, princípio, falas com a anatomia, perguntas, o que observar, objeções, erro a evitar, critério de sucesso e as gravações recomendadas.</p>
              </div>
              <div>
                <p className="font-serif text-lg text-prosperus-navy-panel">Campo</p>
                <p className="text-sm leading-relaxed text-prosperus-neutral-black">Leve aberto durante a conversa. Em cada passo: falas numeradas, perguntas, transição, alerta e próximo passo obrigatório.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-prosperus-neutral-black mb-2">Um passo por tela; as falas em cartões com "copiar".</p>
          )}
          {doc.comoUsar.length > 0 && (
            <ol className="space-y-1">
              {doc.comoUsar.map((l, i) => <li key={i} className="flex items-start leading-relaxed"><span className="script-num" aria-hidden="true">{i + 1}</span><span className="min-w-0 flex-1">{comTags(l)}</span></li>)}
            </ol>
          )}
        </div>
      </details>

      {doc.extras.map((e) => (
        <div key={e.slug} className="script-md" dangerouslySetInnerHTML={{ __html: e.html }} />
      ))}

      {comentarios}
    </div>
  );
};

interface TelaPassoProps {
  doc: ScriptDoc;
  /** Coordenada de CONTEUDO (2..8), a mesma que vai no `data-tela` e no `passo` dos grifos. */
  tela: number;
  documento: DocumentoId;
  comentarios: React.ReactNode;
  tarefasConcluidas: ReadonlySet<string>;
  onTarefa?: (passo: number, tarefaId: string, concluida: boolean) => void;
  amostra?: boolean;
}

/**
 * A tela de um passo. O corpo inteiro (cabeçalho, tabela de perfis no Passo 1, premissa REP no Passo 2, falas,
 * perguntas e callouts) é do `PassoSecoes`: aqui ficam só as tarefas, os treinamentos e os comentários.
 */
const TelaPasso: React.FC<TelaPassoProps> = ({ doc, tela, documento, comentarios, tarefasConcluidas, onTarefa, amostra = false }) => {
  const n = passoNaTela(tela);
  const multiplos = doc.documentos.length > 1;
  const d = documentoDe(doc, documento);
  const p = d?.passos.find((x) => x.n === n) || null;
  const p1 = doc.documentos[0]?.passos.find((x) => x.n === n) || null;
  const nome = (p || p1)?.nome || nomeDoPassoEm(doc, n) || `Passo ${n}`;
  const objetivo = p1?.blocos.find((b) => b.tipo === 'objetivo') || null;
  const docAtivo: DocumentoId = multiplos ? documento : 'treinamento';
  // Vista Campo (item 25): so o que o vendedor usa na reuniao, com tudo aberto e nada atras de clique
  const campo = docAtivo === 'campo';
  return (
    <div data-tela={tela} data-documento={docAtivo} className="script-passo-tela">
      <div key={`${docAtivo}-${n}`}>
        <PassoSecoes
          passo={p}
          passoAlternativo={p1}
          premissa={doc.premissa}
          n={n}
          nome={nome}
          objetivoAlternativo={objetivo ? (objetivo.inline || objetivo.itens.join(' ')) : ''}
          campo={campo}
          todosVisiveis={campo}
        />
      </div>
      {!amostra && <TarefasPasso passo={n} concluidas={tarefasConcluidas} onTarefa={onTarefa} />}
      {!campo && <TreinamentosPasso passo={n} />}
      {comentarios}
    </div>
  );
};

/**
 * A Preparação (onda J, item 23): o cartão que a pessoa baixa e leva para a reunião, desenhado pelo
 * `PreparacaoCartao` (mapa, métricas e o checklist de performance da venda) num nó só, o do download.
 */
const TelaPreparacao: React.FC<{ doc: ScriptDoc; campo?: boolean; acoes?: React.ReactNode; apresentacao?: ApresentacaoCartao; onBaixar?: () => void }> = ({ doc, campo, acoes, apresentacao, onBaixar }) => (
  <div data-tela={TELA_PREPARACAO} data-documento="treinamento" className="space-y-6">
    <PreparacaoCartao doc={doc} campo={campo} />
    {onBaixar && (
      <button
        type="button"
        onClick={onBaixar}
        className="script-no-print script-copiar script-copiar-claro"
        data-testid="baixar-preparacao-tela"
        aria-label="Baixar a preparação como imagem"
      >
        {COPY_BAIXAR_PREPARACAO}
      </button>
    )}
    <BlocoAcoes acoes={acoes} apresentacao={apresentacao} />
  </div>
);

export const ScriptReader: React.FC<ScriptReaderProps> = ({
  doc, clubNome, tela, onTela, versao, ajustes, documento, marcadas, comentariosDo, ficha, onBaixarPreparacao, apresentacao, acoes, totalGrifos, onAbrirGrifos, rootRef,
  tarefasConcluidas = SEM_TAREFAS, onTarefa, amostra = false,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const primeiraRef = useRef(true);
  // Dica unica sobre os grifos: some quando a pessoa fecha (fica lembrado).
  const [dica, setDica] = useState<boolean>(() => !amostra && lerFlag(DICA_GRIFO) !== '1');
  const fecharDica = () => { setDica(false); guardarFlag(DICA_GRIFO, '1'); };

  useEffect(() => {
    const atual = stripRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (atual && typeof atual.scrollIntoView === 'function') {
      try { atual.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch { /* jsdom */ }
    }
    if (primeiraRef.current) { primeiraRef.current = false; return; }
    const root = rootRef.current;
    if (root && typeof root.scrollIntoView === 'function') {
      try { root.scrollIntoView({ block: 'start' }); } catch { /* jsdom */ }
    }
  }, [tela, rootRef]);

  const nomeDoPasso = (n: number) => nomeDoPassoEm(doc, n);
  // A tela que a pessoa ve e de NAVEGACAO; o conteudo (sumario, passos, preparacao) tem a sua propria coordenada.
  const c = conteudoDaNav(tela);

  let conteudo: React.ReactNode;
  if (ehTelaDeInicio(tela)) {
    conteudo = (
      <TelaInicio
        doc={doc}
        clubNome={clubNome}
        versao={versao}
        ajustes={ajustes}
        ficha={ficha}
        onTela={onTela}
        comentarios={comentariosDo(0)}
        tarefasConcluidas={tarefasConcluidas}
        amostra={amostra}
      />
    );
  } else if (ehTelaDePasso(c)) {
    conteudo = <TelaPasso doc={doc} tela={c} documento={documento} comentarios={comentariosDo(passoNaTela(c))} tarefasConcluidas={tarefasConcluidas} onTarefa={onTarefa} amostra={amostra} />;
  } else {
    conteudo = <TelaPreparacao doc={doc} campo={documento === 'campo' && doc.documentos.length > 1} acoes={acoes} apresentacao={apresentacao} onBaixar={amostra ? undefined : onBaixarPreparacao} />;
  }

  // No celular (< 640px) a barra vira duas linhas: o mapa em cima, inteiro; os botoes embaixo, com menos respiro.
  // As classes com `!` vencem o CSS de .script-barra-btn / .script-mapa-strip (styles/globals.css, fora de @layer).
  const btnMovel = 'max-sm:!flex-1 max-sm:!px-2';

  // Onda J (item 7): a pastilha flutuante e o unico caminho para a lista de grifos, no celular e no desktop.
  // Toda tela tem o que grifar (a tela 0 carrega o sumario), entao ela aparece em todas.
  const pastilhaDeGrifos = !!onAbrirGrifos;

  return (
    <div
      className={`script-reader script-no-print${pastilhaDeGrifos ? ' script-reader-com-grifos' : ''}`}
      data-testid="script-reader"
    >
      {/* Uma barra so: grudada no alto no desktop, no rodape no celular (a ordem visual vem do CSS) */}
      <nav aria-label="Índice do script" className="script-barra script-no-print max-sm:flex-wrap">
        <div className="script-barra-progresso" aria-hidden="true"><span style={{ width: `${((tela + 1) / TOTAL_NAV) * 100}%` }} /></div>
        <button type="button" onClick={() => onTela(tela - 1)} disabled={tela <= 0} className={`script-barra-btn ${btnMovel}`} aria-label="Tela anterior">Anterior</button>
        <div ref={stripRef} className="script-mapa-strip max-sm:order-first max-sm:!basis-full">
          {Array.from({ length: TOTAL_NAV }, (_, t) => {
            const atual = t === tela;
            const passoDele = passoNaTela(conteudoDaNav(t));
            const label = passoDele ? `Passo ${passoDele}: ${nomeDoPasso(passoDele)}` : nomeNav(t);
            const curto = rotuloNav(t);
            return (
              <button
                key={t}
                type="button"
                aria-label={label}
                aria-current={atual ? 'page' : undefined}
                data-marcada={marcadas.has(t) ? 'sim' : undefined}
                title={label}
                onClick={() => onTela(t)}
                className={`script-mapa-item ${atual ? 'script-mapa-item-atual' : ''}`}
              >
                {t === NAV_PREPARACAO ? (
                  <><span className="script-mapa-item-longo">{curto}</span><span className="script-mapa-item-curto" aria-hidden="true">Prep.</span></>
                ) : curto}
                {marcadas.has(t) && <span className="script-mapa-ponto" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <span className="script-barra-contador" aria-label={`Tela ${tela + 1} de ${TOTAL_NAV}`}>{tela + 1}/{TOTAL_NAV}</span>
        <button type="button" onClick={() => onTela(tela + 1)} disabled={tela >= TOTAL_NAV - 1} className={`script-barra-btn script-barra-btn-forte ${btnMovel}`} aria-label="Próxima tela">Próximo</button>
      </nav>

      <div ref={rootRef} className="script-paper script-tela w-full rounded-2xl px-5 py-6 sm:px-10 sm:py-9 shadow-2xl" data-tela-atual={tela}>
        {dica && (
          <p className="script-dica script-no-print" data-testid="dica-grifo">
            <span>Marque um trecho para grifar: dourado para ajustar, verde para manter, vermelho para tirar.</span>
            <button type="button" onClick={fecharDica} className="script-dica-fechar" aria-label="Fechar a dica">Entendi</button>
          </p>
        )}
        {conteudo}
        {/* Onda E4: avancar sem voltar ao topo. Fica no fim do conteudo de toda tela. */}
        <RodapeNav tela={tela} onTela={onTela} nomeProxima={nomeNav(tela + 1, nomeDoPasso(passoNaTela(conteudoDaNav(tela + 1))))} amostra={amostra} />
      </div>

      {/* Lista de grifos: pastilha flutuante em todos os tamanhos (onda J, item 7). O papel ganha um rodape
          vazio (`script-reader-com-grifos`) para a pastilha nunca cobrir a ultima linha do texto. */}
      {pastilhaDeGrifos && (
        <button
          type="button"
          onClick={onAbrirGrifos}
          className="script-grifos-flutuante script-no-print"
          aria-label="Abrir a lista de grifos"
          data-testid="grifos-flutuante"
        >
          Grifos{totalGrifos > 0 ? ` · ${totalGrifos}` : ''}
        </button>
      )}
    </div>
  );
};

export default ScriptReader;
