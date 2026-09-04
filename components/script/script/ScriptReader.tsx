import React, { useEffect, useRef, useState } from 'react';
import type { ScriptDoc } from './parseScript';
import { documentoDe } from './parseScript';
import { CartaoView, MapaSection, PassoCorpo, PremissaBox, comTags } from './ScriptPaper';
import { AulaDani, AulaFolha } from './AulaDani';
import { AULA_7_PASSOS } from '../../../data/aula-7-passos';
import {
  TOTAL_TELAS, TELA_CARTAO, TELA_SUMARIO, TELA_PREPARACAO, ehTelaDePasso, passoNaTela, rotuloCurto, nomeTela, type DocumentoId,
} from './telas';

/**
 * O leitor em telas de "Seu script": 0 Cartao de bolso · 1 Sumario · 2..8 um passo por tela (abas Treinamento | Campo)
 * · 9 Preparacao e metricas. Barra fixa no rodape com Anterior, Proximo, o item "Aula" e o mapa (Cartao · Sumario · 1 a 7 ·
 * Preparacao; a tela atual em dourado; um ponto quando a tela tem grifo ou comentario). No celular a barra tem duas
 * linhas (o mapa em cima, os botoes embaixo) para caber em 390px sem rolagem horizontal. Cada tela leva `data-tela` e
 * `data-documento` para a ancora dos grifos. Sem estado de rede: recebe tudo pronto.
 *
 * A aula da Dani sobre os 7 passos (data/aula-7-passos.ts) aparece em tres lugares: o cartao no Sumario (logo depois da
 * lista dos 7 passos), o item "Aula" da barra (abre a folha/painel de qualquer tela) e "Ver na aula da Dani" sob o titulo
 * de cada passo (abre a mesma folha ja no passo). A folha e o AulaFolha (components/script/script/AulaDani.tsx).
 */

/** Valores da ficha que o sumario mostra quando o cabecalho do script nao os traz. */
export interface FichaResumo { oferta?: string; promessa?: string; quemConduz?: string; paraQuem?: string; }

interface ScriptReaderProps {
  doc: ScriptDoc;
  clubNome: string;
  tela: number;
  onTela: (t: number) => void;
  documento: DocumentoId;
  onDocumento: (d: DocumentoId) => void;
  /** Telas com grifo ou comentario (ponto no mapa). */
  marcadas: Set<number>;
  comentariosDo: (passo: number) => React.ReactNode;
  ficha?: FichaResumo;
  onImprimirCartao?: () => void;
  totalGrifos: number;
  onAbrirGrifos?: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const DICA_GRIFO = 'script-dica-grifo';
const ABA_SESSAO = 'script-aba';

function lerFlag(chave: string, store: 'localStorage' | Storage = 'localStorage'): string | null {
  try {
    const s = store === 'localStorage' ? (typeof localStorage === 'undefined' ? null : localStorage) : store;
    return s ? s.getItem(chave) : null;
  } catch { return null; }
}
function guardarFlag(chave: string, valor: string, store: 'localStorage' | Storage = 'localStorage'): void {
  try {
    const s = store === 'localStorage' ? (typeof localStorage === 'undefined' ? null : localStorage) : store;
    if (s) s.setItem(chave, valor);
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

const TelaCartao: React.FC<{ doc: ScriptDoc; onImprimir?: () => void }> = ({ doc, onImprimir }) => (
  <div data-tela={TELA_CARTAO} data-documento="campo" className="space-y-4">
    <Intro>O que cabe numa folha dobrada, para levar na reunião. Copie ou imprima; o script inteiro vem nas telas seguintes.</Intro>
    {doc.cartao ? (
      <CartaoView
        cartao={doc.cartao}
        montado={doc.cartaoMontado}
        id="script-cartao-tela"
        acoes={onImprimir && (
          <button type="button" onClick={onImprimir} className="script-no-print script-copiar script-copiar-claro" aria-label="Imprimir cartão de bolso">Imprimir cartão</button>
        )}
      />
    ) : (
      <p className="text-sm text-prosperus-navy-panel/70">Esta versão veio sem cartão de bolso.</p>
    )}
  </div>
);

const TelaSumario: React.FC<{ doc: ScriptDoc; clubNome: string; ficha?: FichaResumo; onTela: (t: number) => void; comentarios: React.ReactNode }> = ({ doc, clubNome, ficha, onTela, comentarios }) => {
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
                    <span className="min-w-0">
                      <span className="block font-serif text-[1.1rem] leading-snug text-prosperus-navy-panel">{p.nome}</span>
                      {objetivo && <span className="block text-sm text-prosperus-navy-panel/70 leading-snug">{comTags(objetivo.inline || objetivo.itens.join(' '))}</span>}
                    </span>
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
              <p className="text-sm leading-relaxed text-prosperus-neutral-black">Leia antes da reunião. Em cada passo: objetivo, estado do cliente, princípio, falas com a anatomia, perguntas, o que observar, objeções, erro a evitar e critério de sucesso.</p>
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
            {doc.comoUsar.map((l, i) => <li key={i} className="flex items-start leading-relaxed"><span className="script-num" aria-hidden="true">{i + 1}</span>{comTags(l)}</li>)}
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

const TelaPasso: React.FC<{ doc: ScriptDoc; tela: number; documento: DocumentoId; onDocumento: (d: DocumentoId) => void; comentarios: React.ReactNode; onVerAula: (passo: number) => void }> = ({ doc, tela, documento, onDocumento, comentarios, onVerAula }) => {
  const n = passoNaTela(tela);
  const multiplos = doc.documentos.length > 1;
  const d = documentoDe(doc, documento);
  const p = d?.passos.find((x) => x.n === n) || null;
  const p1 = doc.documentos[0]?.passos.find((x) => x.n === n) || null;
  const nome = (p || p1)?.nome || nomeDoPassoEm(doc, n) || `Passo ${n}`;
  const objetivo = p1?.blocos.find((b) => b.tipo === 'objetivo') || null;
  const mostraObjetivo = objetivo && !(p && p.blocos.some((b) => b.tipo === 'objetivo'));
  const docAtivo: DocumentoId = multiplos ? documento : 'treinamento';
  return (
    <div data-tela={tela} data-documento={docAtivo} className="script-passo-tela">
      <header className="flex items-center gap-4 mb-4">
        <span className="script-medalha" aria-hidden="true">{n}</span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">Passo {n} de 7</p>
          <h2 className="script-h2 font-serif text-2xl sm:text-[1.7rem] leading-tight text-prosperus-navy-panel">{nome}</h2>
          <button
            type="button"
            onClick={() => onVerAula(n)}
            aria-haspopup="dialog"
            className="script-no-print script-ver-aula -mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-semibold text-prosperus-gold-dark underline-offset-4 hover:underline"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z" /></svg>
            Ver na aula da Dani
          </button>
        </div>
      </header>
      {mostraObjetivo && objetivo && (
        <p className="script-objetivo mb-4">
          <span className="script-nota-rotulo">{objetivo.rotulo}</span>
          <span className="font-serif text-[1.15rem] leading-snug text-prosperus-navy-panel">{comTags(objetivo.inline || objetivo.itens.join(' '))}</span>
        </p>
      )}
      {multiplos && (
        <div className="script-no-print">
          <div role="tablist" aria-label="Documento do script" className="script-abas">
            {(['treinamento', 'campo'] as DocumentoId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={documento === id}
                onClick={() => onDocumento(id)}
                className={`script-aba ${documento === id ? 'script-aba-ativa' : ''}`}
              >
                {id === 'campo' ? 'Campo' : 'Treinamento'}
              </button>
            ))}
          </div>
          <p className="script-abas-legenda">
            {documento === 'campo' ? 'Para levar aberto durante a conversa: só o que dizer e perguntar.' : 'Para ler antes da reunião: cada fala com o porquê.'}
          </p>
        </div>
      )}
      <div role={multiplos ? 'tabpanel' : undefined} key={`${docAtivo}-${n}`} className="mt-4">
        {p ? <PassoCorpo passo={p} /> : (
          <p className="text-sm text-prosperus-navy-panel/70">Este passo não está no script de {docAtivo === 'campo' ? 'campo' : 'treinamento'} desta versão.</p>
        )}
      </div>
      {comentarios}
    </div>
  );
};

const TelaPreparacao: React.FC<{ doc: ScriptDoc }> = ({ doc }) => {
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
    </div>
  );
};

export const ScriptReader: React.FC<ScriptReaderProps> = ({
  doc, clubNome, tela, onTela, documento, onDocumento, marcadas, comentariosDo, ficha, onImprimirCartao, totalGrifos, onAbrirGrifos, rootRef,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const primeiraRef = useRef(true);
  // Dica unica sobre os grifos: some quando a pessoa fecha (fica lembrado).
  const [dica, setDica] = useState<boolean>(() => lerFlag(DICA_GRIFO) !== '1');
  const fecharDica = () => { setDica(false); guardarFlag(DICA_GRIFO, '1'); };
  // Aba (Treinamento | Campo) lembrada na sessao.
  useEffect(() => {
    const salva = lerFlag(ABA_SESSAO, sessionStorage);
    if ((salva === 'campo' || salva === 'treinamento') && salva !== documento) onDocumento(salva);
    // so na abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { guardarFlag(ABA_SESSAO, documento, sessionStorage); }, [documento]);
  // Folha da aula: aberta pela barra (com o passo da tela atual, se for tela de passo) ou por "Ver na aula da Dani".
  const [aula, setAula] = useState<{ aberta: boolean; passo: number | null }>({ aberta: false, passo: null });
  const abrirAula = (passo: number | null) => setAula({ aberta: true, passo });
  const fecharAula = () => setAula((a) => ({ ...a, aberta: false }));

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

  let conteudo: React.ReactNode;
  if (tela === TELA_CARTAO) conteudo = <TelaCartao doc={doc} onImprimir={onImprimirCartao} />;
  else if (tela === TELA_SUMARIO) conteudo = <TelaSumario doc={doc} clubNome={clubNome} ficha={ficha} onTela={onTela} comentarios={comentariosDo(0)} />;
  else if (ehTelaDePasso(tela)) conteudo = <TelaPasso doc={doc} tela={tela} documento={documento} onDocumento={onDocumento} comentarios={comentariosDo(passoNaTela(tela))} onVerAula={abrirAula} />;
  else conteudo = <TelaPreparacao doc={doc} />;

  // No celular (< 640px) a barra vira duas linhas: o mapa em cima, inteiro; os botoes embaixo, com menos respiro.
  // As classes com `!` vencem o CSS de .script-barra-btn / .script-mapa-strip (styles/globals.css, fora de @layer).
  const btnMovel = 'max-sm:!flex-1 max-sm:!px-2';

  return (
    <div className="script-reader script-no-print" data-testid="script-reader">
      <div ref={rootRef} className="script-paper script-tela w-full rounded-2xl px-5 py-6 sm:px-10 sm:py-9 shadow-2xl" data-tela-atual={tela}>
        {dica && (
          <p className="script-dica script-no-print" data-testid="dica-grifo">
            <span>Marque um trecho para grifar: dourado para ajustar, verde para manter, vermelho para tirar.</span>
            <button type="button" onClick={fecharDica} className="script-dica-fechar" aria-label="Fechar a dica">Entendi</button>
          </p>
        )}
        {conteudo}
      </div>

      <nav aria-label="Índice do script" className="script-barra script-no-print max-sm:flex-wrap">
        <div className="script-barra-progresso" aria-hidden="true"><span style={{ width: `${((tela + 1) / TOTAL_TELAS) * 100}%` }} /></div>
        <button type="button" onClick={() => onTela(tela - 1)} disabled={tela <= 0} className={`script-barra-btn ${btnMovel}`} aria-label="Tela anterior">Anterior</button>
        <div ref={stripRef} className="script-mapa-strip max-sm:order-first max-sm:!basis-full">
          {Array.from({ length: TOTAL_TELAS }, (_, t) => {
            const atual = t === tela;
            const label = ehTelaDePasso(t) ? `Passo ${passoNaTela(t)}: ${nomeDoPasso(passoNaTela(t))}` : nomeTela(t);
            const curto = rotuloCurto(t);
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
                {t === TELA_PREPARACAO ? (
                  <><span className="script-mapa-item-longo">{curto}</span><span className="script-mapa-item-curto" aria-hidden="true">Prep.</span></>
                ) : curto}
                {marcadas.has(t) && <span className="script-mapa-ponto" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <span className="script-barra-contador" aria-label={`Tela ${tela + 1} de ${TOTAL_TELAS}`}>{tela + 1}/{TOTAL_TELAS}</span>
        <button
          type="button"
          onClick={() => abrirAula(ehTelaDePasso(tela) ? passoNaTela(tela) : null)}
          className={`script-barra-btn script-barra-aula ${btnMovel} !border-prosperus-gold-dark/70 !text-prosperus-gold-light`}
          aria-label="Aula da Dani sobre os 7 passos"
          aria-haspopup="dialog"
          aria-expanded={aula.aberta}
          title="Aula da Dani sobre os 7 passos"
        >
          Aula
        </button>
        {onAbrirGrifos && (
          <button type="button" onClick={onAbrirGrifos} className={`script-barra-btn lg:hidden ${btnMovel}`} aria-label="Abrir a lista de grifos">
            Grifos{totalGrifos > 0 ? ` · ${totalGrifos}` : ''}
          </button>
        )}
        <button type="button" onClick={() => onTela(tela + 1)} disabled={tela >= TOTAL_TELAS - 1} className={`script-barra-btn script-barra-btn-forte ${btnMovel}`} aria-label="Próxima tela">Próximo</button>
      </nav>

      <AulaFolha aberta={aula.aberta} passo={aula.passo} onFechar={fecharAula} />
    </div>
  );
};

export default ScriptReader;
