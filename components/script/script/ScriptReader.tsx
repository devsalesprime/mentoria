import React, { useEffect, useRef, useState } from 'react';
import type { ScriptDoc } from './parseScript';
import { documentoDe } from './parseScript';
import { CartaoView, MapaSection, PremissaBox, comTags } from './ScriptPaper';
import { PassoSecoes } from './secoes/PassoSecoes';
import { AulaDani } from './AulaDani';
import { AULA_7_PASSOS } from '../../../data/aula-7-passos';
import { TreinamentosPasso } from './TreinamentosPasso';
import { TarefasPasso } from './TarefasPasso';
import { PerfisTabela, extrairPerfis } from './PerfisTabela';
import { contagemDoPasso } from './tarefas';
import {
  TOTAL_NAV, NAV_INICIO, NAV_CARTAO, NAV_SUMARIO, NAV_PREPARACAO,
  TELA_CARTAO, TELA_SUMARIO, TELA_PREPARACAO,
  conteudoDaNav, ehTelaDeInicio, ehTelaDePasso, passoNaTela, rotuloNav, nomeNav, type DocumentoId,
} from './telas';

/**
 * O leitor em telas de "Seu script": 0 Inicio · 1 Cartao de bolso · 2 Sumario · 3..9 um passo por tela ·
 * 10 Preparacao e metricas. O `tela` que entra aqui e o indice de NAVEGACAO; `data-tela` continua sendo a
 * coordenada de CONTEUDO (0..9), que e a que os grifos e os comentarios guardam (ver telas.ts).
 *
 * Onda E4 (pedidos do dono em 07/09):
 * - tela 0 "O seu script está pronto": contexto, como usar (navegar, grifar, pedir ajustes), o que vem depois
 *   (a apresentacao comercial) e os dois botoes de entrada (cartao de bolso e sumario);
 * - RODAPE de navegacao no fim de TODA tela ("Anterior" e "Próximo: <nome da próxima tela>"), para ninguem
 *   precisar voltar ao topo; na ultima tela o "Próximo" vira "Ir para as ações".
 *
 * Onda E1 (SPEC-workflow-v3-decisoes-07-09 §2):
 * - a escolha Treinamento | Campo saiu de dentro do passo e virou global, na barra de cima da tela (ScriptScreen);
 *   aqui ela chega pronta em `documento`. Na vista Campo o leitor esconde os treinamentos e o "Por que funciona"
 *   das falas: fica so o que o vendedor usa na reuniao;
 * - a navegacao (mapa Cartao · Sumario · 1 a 7 · Preparacao) fica numa barra so: grudada no ALTO no desktop e no
 *   RODAPE no celular (a ordem visual e do CSS, `.script-barra`), sempre com Anterior e Proximo e as setas do teclado;
 * - a barra nao tem mais "Aula" nem "Grifos": a aula macro vive so no Sumario e a lista de grifos abre num botao
 *   flutuante (celular);
 * - os treinamentos foram para o FIM da tela do passo, depois das tarefas;
 * - o Cartao de bolso tem um botao so, "Baixar cartão" (imagem), e a apresentacao comercial saiu dele;
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
export const COPY_BAIXAR_CARTAO = 'Baixar cartão';
export const ROTULO_ACOES = 'Ações';

/** Uma rodada de ajustes por clube (onda E4). O servidor manda `ajustes_usados` e `ajustes_limite` na ficha. */
export interface AjustesInfo { usados: number; limite: number }
export const COPY_AJUSTES_SOBRANDO = 'Você tem uma rodada de ajustes incluída.';
export const COPY_AJUSTES_USADOS = 'A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.';

interface ScriptReaderProps {
  doc: ScriptDoc;
  clubNome: string;
  /** Indice de NAVEGACAO: 0 Inicio · 1 Cartao · 2 Sumario · 3..9 Passos · 10 Preparacao. */
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
  /** "Baixar cartão": o cartao de bolso vira imagem (PNG). */
  onBaixarCartao?: () => void;
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

const BLOCOS = [
  { nome: 'Conexão', passos: 'Passo 1', telas: [2] },
  { nome: 'Investigação', passos: 'Passo 2', telas: [3] },
  { nome: 'Solução', passos: 'Passos 3 a 7', telas: [4, 5, 6, 7, 8] },
];

function nomeDoPassoEm(doc: ScriptDoc, n: number): string {
  for (const d of doc.documentos) {
    const p = d.passos.find((x) => x.n === n);
    if (p) return p.nome;
  }
  return '';
}

const Intro: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="script-tela-intro">{children}</p>
);

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

/**
 * Tela 0 (onda E4): a porta de entrada do script. Diz que ele está pronto, mostra como navegar, como grifar e
 * como pedir os ajustes, e antecipa a apresentação comercial que vem depois da validação.
 */
const TelaInicio: React.FC<{ clubNome: string; versao?: number | null; ajustes?: AjustesInfo; onTela: (t: number) => void }> = ({ clubNome, versao, ajustes, onTela }) => {
  const sobrando = !ajustes || ajustes.usados < ajustes.limite;
  return (
    <div className="script-inicio space-y-6" data-testid="tela-inicio">
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
            <p className="text-sm leading-relaxed text-prosperus-neutral-black">
              Uma tela por vez: o cartão de bolso, o sumário, os 7 passos e a preparação. Use Anterior e Próximo no fim de cada tela ou o mapa das telas. Em cima você escolhe entre Treinamento e Campo.
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

      <div className="script-inicio-botoes">
        <button type="button" onClick={() => onTela(NAV_CARTAO)} className="script-acao script-acao-forte" data-testid="inicio-cartao">
          Começar pelo cartão de bolso
        </button>
        <button type="button" onClick={() => onTela(NAV_SUMARIO)} className="script-acao" data-testid="inicio-sumario">
          Ver o sumário
        </button>
      </div>
    </div>
  );
};

/**
 * Rodape de navegacao (onda E4): fica no FIM do conteudo de toda tela, para ninguem precisar voltar ao topo
 * para avancar. Na ultima tela o "Próximo" vira "Ir para as ações" e rola ate o bloco de decisao.
 */
const RodapeNav: React.FC<{ tela: number; onTela: (t: number) => void; nomeProxima: string }> = ({ tela, onTela, nomeProxima }) => {
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
      {ultima ? (
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

const TelaCartao: React.FC<{ doc: ScriptDoc; onBaixar?: () => void }> = ({ doc, onBaixar }) => (
  <div data-tela={TELA_CARTAO} data-documento="campo" className="space-y-4">
    <Intro>O que cabe numa folha dobrada, para levar na reunião. Baixe a imagem e leve no celular; o script inteiro vem nas telas seguintes.</Intro>
    {doc.cartao ? (
      <CartaoView
        cartao={doc.cartao}
        montado={doc.cartaoMontado}
        id="script-cartao-tela"
        acoes={onBaixar && (
          <button type="button" onClick={onBaixar} className="script-no-print script-copiar script-copiar-claro" data-testid="baixar-cartao-tela" aria-label="Baixar o cartão de bolso como imagem">{COPY_BAIXAR_CARTAO}</button>
        )}
      />
    ) : (
      <p className="text-sm text-prosperus-navy-panel/70">Esta versão veio sem cartão de bolso.</p>
    )}
  </div>
);

/** Chip "x/y" das tarefas de um passo, no Sumario. Fica dourado cheio quando o passo esta completo. */
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

const TelaSumario: React.FC<{ doc: ScriptDoc; clubNome: string; ficha?: FichaResumo; onTela: (t: number) => void; comentarios: React.ReactNode; tarefasConcluidas: ReadonlySet<string> }> = ({ doc, clubNome, ficha, onTela, comentarios, tarefasConcluidas }) => {
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
  return (
    <div data-tela={TELA_SUMARIO} data-documento="treinamento" className="space-y-7">
      <header className="script-titulo">
        <p className="text-[11px] uppercase tracking-[0.24em] text-prosperus-gold-dark font-semibold">{clubNome}</p>
        <h2 className="script-h1 font-serif text-3xl sm:text-[2.2rem] leading-tight text-prosperus-navy-panel mt-1">Script dos 7 passos da venda</h2>
        {doc.oferta && <p className="font-serif text-lg text-prosperus-navy-panel/80 mt-1">{doc.oferta}</p>}
        <div className="script-rule mt-4" aria-hidden="true" />
      </header>

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
            <button key={b.nome} type="button" onClick={() => onTela(b.telas[0])} className="script-bloco-card">
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
                  <button type="button" onClick={() => onTela(p.n + 1)} className="script-passo-linha" aria-label={`Ir para o passo ${p.n}: ${p.nome}`}>
                    <span className="script-num" aria-hidden="true">{p.n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[1.1rem] leading-snug text-prosperus-navy-panel">{p.nome}</span>
                      {objetivo && <span className="block text-sm text-prosperus-navy-panel/70 leading-snug">{comTags(objetivo.inline || objetivo.itens.join(' '))}</span>}
                    </span>
                    <ChipTarefas passo={p.n} concluidas={tarefasConcluidas} />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <AulaDani aula={AULA_7_PASSOS} />

      {doc.premissa && <PremissaBox premissa={doc.premissa} />}

      <section aria-label="Como usar este script" className="script-como-usar">
        <p className="script-nota-rotulo">Como usar este script</p>
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
      </section>

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
}

const TelaPasso: React.FC<TelaPassoProps> = ({ doc, tela, documento, comentarios, tarefasConcluidas, onTarefa }) => {
  const n = passoNaTela(tela);
  const multiplos = doc.documentos.length > 1;
  const d = documentoDe(doc, documento);
  const p = d?.passos.find((x) => x.n === n) || null;
  const p1 = doc.documentos[0]?.passos.find((x) => x.n === n) || null;
  const nome = (p || p1)?.nome || nomeDoPassoEm(doc, n) || `Passo ${n}`;
  const objetivo = p1?.blocos.find((b) => b.tipo === 'objetivo') || null;
  const docAtivo: DocumentoId = multiplos ? documento : 'treinamento';
  // Vista Campo: so o que o vendedor usa na reuniao (sem treinamentos e sem "Por que funciona")
  const campo = docAtivo === 'campo';
  // "Quem esta do outro lado" vira tabela de verdade depois do corpo; o bloco sai do corpo para nao repetir.
  const perfis = extrairPerfis(p) || extrairPerfis(p1);
  const corpo = p && perfis && p.blocos.includes(perfis.bloco)
    ? { ...p, blocos: p.blocos.filter((b) => b !== perfis.bloco) }
    : p;
  return (
    <div data-tela={tela} data-documento={docAtivo} className="script-passo-tela">
      <div key={`${docAtivo}-${n}`}>
        <PassoSecoes
          passo={corpo}
          n={n}
          nome={nome}
          objetivoAlternativo={objetivo ? (objetivo.inline || objetivo.itens.join(' ')) : ''}
          campo={campo}
        />
      </div>
      {perfis && <PerfisTabela tabela={perfis.tabela} />}
      <TarefasPasso passo={n} concluidas={tarefasConcluidas} onTarefa={onTarefa} />
      {!campo && <TreinamentosPasso passo={n} />}
      {comentarios}
    </div>
  );
};

const TelaPreparacao: React.FC<{ doc: ScriptDoc; acoes?: React.ReactNode; apresentacao?: ApresentacaoCartao }> = ({ doc, acoes, apresentacao }) => {
  const extras = doc.documentos.flatMap((d) => d.extras.filter((e) => e.titulo !== 'Abertura'));
  return (
    <div data-tela={TELA_PREPARACAO} data-documento="treinamento" className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">Antes e depois da reunião</p>
        <h2 className="script-h2 font-serif text-2xl sm:text-[1.7rem] leading-tight text-prosperus-navy-panel">Preparação e métricas</h2>
      </header>
      {doc.mapa && <MapaSection mapa={doc.mapa} />}
      {extras.map((e) => (
        <section key={e.slug} className="script-extra">
          <h3 className="script-h2 font-serif text-2xl text-prosperus-navy-panel mb-3">{e.titulo}</h3>
          <div className="script-md" dangerouslySetInnerHTML={{ __html: e.html }} />
        </section>
      ))}
      {!doc.mapa && extras.length === 0 && <p className="text-sm text-prosperus-navy-panel/70">Esta versão veio sem mapa de preparação e sem métricas.</p>}
      <BlocoAcoes acoes={acoes} apresentacao={apresentacao} />
    </div>
  );
};

export const ScriptReader: React.FC<ScriptReaderProps> = ({
  doc, clubNome, tela, onTela, versao, ajustes, documento, marcadas, comentariosDo, ficha, onBaixarCartao, apresentacao, acoes, totalGrifos, onAbrirGrifos, rootRef,
  tarefasConcluidas = SEM_TAREFAS, onTarefa,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const primeiraRef = useRef(true);
  // Dica unica sobre os grifos: some quando a pessoa fecha (fica lembrado).
  const [dica, setDica] = useState<boolean>(() => lerFlag(DICA_GRIFO) !== '1');
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
  // A tela que a pessoa ve e de NAVEGACAO; o conteudo (cartao, sumario, passos, preparacao) vive uma casa atras.
  const c = conteudoDaNav(tela);
  const irParaSumario = (t: number) => onTela(t + 1);

  let conteudo: React.ReactNode;
  if (ehTelaDeInicio(tela)) conteudo = <TelaInicio clubNome={clubNome} versao={versao} ajustes={ajustes} onTela={onTela} />;
  else if (c === TELA_CARTAO) conteudo = <TelaCartao doc={doc} onBaixar={onBaixarCartao} />;
  else if (c === TELA_SUMARIO) conteudo = <TelaSumario doc={doc} clubNome={clubNome} ficha={ficha} onTela={irParaSumario} comentarios={comentariosDo(0)} tarefasConcluidas={tarefasConcluidas} />;
  else if (ehTelaDePasso(c)) conteudo = <TelaPasso doc={doc} tela={c} documento={documento} comentarios={comentariosDo(passoNaTela(c))} tarefasConcluidas={tarefasConcluidas} onTarefa={onTarefa} />;
  else conteudo = <TelaPreparacao doc={doc} acoes={acoes} apresentacao={apresentacao} />;

  // No celular (< 640px) a barra vira duas linhas: o mapa em cima, inteiro; os botoes embaixo, com menos respiro.
  // As classes com `!` vencem o CSS de .script-barra-btn / .script-mapa-strip (styles/globals.css, fora de @layer).
  const btnMovel = 'max-sm:!flex-1 max-sm:!px-2';

  return (
    <div className="script-reader script-no-print" data-testid="script-reader">
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
        <RodapeNav tela={tela} onTela={onTela} nomeProxima={nomeNav(tela + 1, nomeDoPasso(passoNaTela(conteudoDaNav(tela + 1))))} />
      </div>

      {/* Lista de grifos no celular: botao flutuante (a barra nao carrega mais esse peso) */}
      {onAbrirGrifos && (
        <button
          type="button"
          onClick={onAbrirGrifos}
          className="script-grifos-flutuante script-no-print lg:hidden"
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
