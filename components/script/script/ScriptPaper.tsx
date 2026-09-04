import React, { useState } from 'react';
import type { Bloco, Documento, Fala, PassoDoc, Premissa, ScriptDoc } from './parseScript';
import { falaParaCopiar, segmentar } from './parseScript';
import { AnatomiaLegenda, textoComAnatomia } from './AnatomiaFala';
import { renderMarkdown as renderMd } from '../../../utils/markdown';

/**
 * A folha do script: papel creme, bloco de titulo, cabecalho, "Como usar", os documentos (treinamento e campo),
 * cada passo com medalhao dourado, falas em cartoes de citacao com "copiar", perguntas em checklist, notas lado a
 * lado, Mapa de preparacao em tabela e Cartao de bolso com "Copiar cartao". Sem estado de rede: recebe tudo pronto.
 * Classes `.script-*` e a folha de impressao vivem em styles/globals.css.
 */

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const CopyButton: React.FC<{ texto: string; rotulo: string; ariaLabel: string; className?: string }> = ({ texto, rotulo, ariaLabel, className }) => {
  const [feito, setFeito] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={async () => {
        const ok = await copiarTexto(texto);
        if (ok) {
          setFeito(true);
          setTimeout(() => setFeito(false), 1500);
        }
      }}
      className={`script-no-print script-copiar ${className || ''}`}
    >
      {feito ? 'copiado' : rotulo}
    </button>
  );
};

export const SLOT_DICA = 'personalize com o que este cliente disse';

/**
 * Texto com o que esta entre colchetes virado em etiqueta: instrucao ([Pausa.], [FALA DO VENDEDOR], [ACIONAR MENTORA]),
 * campo de personalizacao ao vivo ([nome], [repita a dor que ele acabou de falar]: chip dourado com a pena) ou
 * marca proibida ([VALIDAR ...], [DEFINIR ...]: chip vermelho, nao deveria existir num script publicado).
 */
export function comTags(texto: string): React.ReactNode {
  return segmentar(texto).map((t, i) => {
    if (t.tipo === 'texto') return <React.Fragment key={i}>{t.valor}</React.Fragment>;
    if (t.tipo === 'slot') {
      return (
        <span key={i} className="script-slot" title={SLOT_DICA} aria-label={`${t.valor} (${SLOT_DICA})`} data-testid="slot">
          <span className="script-slot-pena" aria-hidden="true">&#x270E;</span>
          {t.valor}
        </span>
      );
    }
    if (t.tipo === 'proibido') return <span key={i} className="script-proibido" title="marca que não deveria estar no script" data-testid="proibido">{t.valor}</span>;
    const acionar = /^ACIONAR/i.test(t.valor);
    return <span key={i} className={`script-tag${acionar ? ' script-tag-acionar' : ''}`}>{t.valor}</span>;
  });
}

const FalaCard: React.FC<{ fala: Fala; passo: number }> = ({ fala, passo }) => {
  const [ativo, setAtivo] = useState<number | null>(null);
  const temAnatomia = fala.anatomia.length > 0 || fala.anatomiaBruta.length > 0;
  return (
    <figure className="script-fala">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-semibold text-prosperus-gold-dark">
          {fala.n != null && <span>Fala {fala.n}</span>}
          {fala.voz && <span className={`script-tag${fala.voz === 'mentor' ? ' script-tag-acionar' : ''}`}>{fala.vozRotulo || (fala.voz === 'mentor' ? 'Mentor' : 'Vendedor')}</span>}
        </figcaption>
        <CopyButton texto={falaParaCopiar(fala)} rotulo="copiar" ariaLabel={`Copiar fala${fala.n != null ? ` ${fala.n}` : ''} do passo ${passo}`} />
      </div>
      <blockquote className="script-fala-texto mt-1">{temAnatomia ? textoComAnatomia(fala, ativo, comTags) : comTags(fala.texto)}</blockquote>
      {fala.direcao && <p className="script-fala-direcao">{comTags(fala.direcao)}</p>}
      {temAnatomia && <AnatomiaLegenda fala={fala} ativo={ativo} onAtivo={setAtivo} />}
    </figure>
  );
};

/** Caixa "Premissa REP: Repetir, Elogiar, Perguntar", com a citacao da fonte no rodape. */
export const PremissaBox: React.FC<{ premissa: Premissa }> = ({ premissa }) => (
  <aside className="script-premissa" data-testid="premissa">
    <p className="script-nota-rotulo">Premissa</p>
    <h3 className="font-serif text-xl text-prosperus-navy-panel leading-tight">{premissa.titulo}</h3>
    <div className="script-md mt-1" dangerouslySetInnerHTML={{ __html: premissa.html }} />
    {premissa.citacao && <p className="script-premissa-citacao">{premissa.citacao}</p>}
  </aside>
);

/** Cartao de bolso (navy): o que cabe numa folha dobrada. `acoes` = botoes extras (imprimir). */
export const CartaoView: React.FC<{ cartao: NonNullable<ScriptDoc['cartao']>; montado?: boolean; acoes?: React.ReactNode; id?: string }> = ({ cartao, montado, acoes, id }) => (
  <section id={id || 'script-cartao'} className="script-cartao scroll-mt-20 lg:scroll-mt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="font-serif text-2xl text-prosperus-gold-light leading-tight">Cartão de bolso</h2>
      <div className="flex flex-wrap gap-2">
        <CopyButton texto={cartao.texto} rotulo="Copiar cartão" ariaLabel="Copiar cartão de bolso" className="script-copiar-claro" />
        {acoes}
      </div>
    </div>
    {montado && <p className="text-xs text-prosperus-gold-light/80 mt-1">Montado a partir do script de campo: a primeira fala de cada passo.</p>}
    <div className="script-cartao-corpo mt-2" dangerouslySetInnerHTML={{ __html: cartao.html }} />
  </section>
);

const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="script-nota-rotulo">{children}</span>
);

function classeNota(tipo: Bloco['tipo']): string {
  if (tipo === 'erro' || tipo === 'alerta') return 'script-nota script-nota-erro';
  if (tipo === 'proximo') return 'script-nota script-nota-proximo';
  if (tipo === 'observar') return 'script-nota script-nota-observar';
  return 'script-nota';
}

const Nota: React.FC<{ bloco: Bloco }> = ({ bloco }) => (
  <div className={classeNota(bloco.tipo)}>
    <Rotulo>{bloco.rotulo}</Rotulo>
    {bloco.inline && <p className="leading-relaxed">{comTags(bloco.inline)}</p>}
    {bloco.itens.length > 0 && (
      <ul className="mt-1 space-y-1">
        {bloco.itens.map((it, i) => <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(it)}</li>)}
      </ul>
    )}
  </div>
);

const Checklist: React.FC<{ bloco: Bloco }> = ({ bloco }) => (
  <div className="script-checklist">
    <Rotulo>{bloco.rotulo}</Rotulo>
    <ul className="space-y-1.5">
      {bloco.itens.map((it, i) => (
        <li key={i} className="flex items-start leading-relaxed text-[0.95rem]"><span className="script-check" aria-hidden="true" />{comTags(it)}</li>
      ))}
    </ul>
  </div>
);

const Objecoes: React.FC<{ bloco: Bloco }> = ({ bloco }) => (
  <div className="script-nota">
    <Rotulo>{bloco.rotulo}</Rotulo>
    <ul className="space-y-2">
      {bloco.itens.map((it, i) => {
        const m = /^(?:objeç[aã]o\s*:?\s*)?(.*?)\s*(?:resposta\s*:\s*)(.*)$/i.exec(it);
        if (!m) return <li key={i} className="leading-relaxed">{comTags(it)}</li>;
        return (
          <li key={i} className="leading-relaxed">
            <span className="text-prosperus-navy-panel/70">{comTags(m[1].replace(/^["“]|["”]$/g, ''))}</span>
            <span className="block font-serif text-[1.05rem] text-prosperus-navy-panel">{comTags(m[2].replace(/^["“]|["”]$/g, ''))}</span>
          </li>
        );
      })}
    </ul>
  </div>
);

const Dizer: React.FC<{ bloco: Bloco; passo: number }> = ({ bloco, passo }) => (
  <div className="script-dizer space-y-3">
    <Rotulo>{bloco.rotulo}</Rotulo>
    {bloco.dizer.map((node, i) => node.kind === 'sub'
      ? <h3 key={i} className="script-h3 font-serif text-lg text-prosperus-navy-panel pt-2">{node.titulo}</h3>
      : <FalaCard key={i} fala={node} passo={passo} />)}
  </div>
);

const Generico: React.FC<{ bloco: Bloco }> = ({ bloco }) => (
  <div className="script-md">
    {bloco.rotulo && <Rotulo>{bloco.rotulo}</Rotulo>}
    <div dangerouslySetInnerHTML={{ __html: bloco.md ? renderMd(bloco.md) : '' }} />
  </div>
);

const NOTAS_CURTAS = new Set<Bloco['tipo']>(['estado', 'principio', 'avancar', 'silencio', 'erro', 'sucesso', 'transicao', 'alerta', 'proximo', 'observar']);

/** Agrupa blocos curtos consecutivos numa grade de duas colunas (Sinais e Erro a evitar lado a lado no desktop). */
function agrupa(blocos: Bloco[]): (Bloco | Bloco[])[] {
  const out: (Bloco | Bloco[])[] = [];
  let grupo: Bloco[] = [];
  const fecha = () => { if (grupo.length === 1) out.push(grupo[0]); else if (grupo.length > 1) out.push(grupo); grupo = []; };
  for (const b of blocos) {
    if (NOTAS_CURTAS.has(b.tipo)) grupo.push(b);
    else { fecha(); out.push(b); }
  }
  fecha();
  return out;
}

const BlocoView: React.FC<{ bloco: Bloco; passo: number }> = ({ bloco, passo }) => {
  switch (bloco.tipo) {
    case 'objetivo':
      return (
        <p className="script-objetivo">
          <Rotulo>{bloco.rotulo}</Rotulo>
          <span className="font-serif text-[1.15rem] leading-snug text-prosperus-navy-panel">{comTags(bloco.inline || bloco.itens.join(' '))}</span>
        </p>
      );
    case 'dizer': return <Dizer bloco={bloco} passo={passo} />;
    case 'perguntas': return <Checklist bloco={bloco} />;
    case 'objecoes': return <Objecoes bloco={bloco} />;
    case 'outro': return <Generico bloco={bloco} />;
    default: return <Nota bloco={bloco} />;
  }
};

/** So os blocos de um passo (o leitor em telas poe o proprio cabecalho). */
export const PassoCorpo: React.FC<{ passo: PassoDoc }> = ({ passo }) => (
  <div className="space-y-4">
    {agrupa(passo.blocos).map((item, i) => Array.isArray(item)
      ? <div key={i} className="grid gap-3 sm:grid-cols-2">{item.map((b, j) => <BlocoView key={j} bloco={b} passo={passo.n} />)}</div>
      : <BlocoView key={i} bloco={item} passo={passo.n} />)}
  </div>
);

export const PassoSection: React.FC<{
  passo: PassoDoc;
  docId: string;
  refCb: (el: HTMLElement | null) => void;
  comentarios?: React.ReactNode;
}> = ({ passo, docId, refCb, comentarios }) => (
  <section id={`${docId}-p${passo.n}`} data-passo={passo.n} data-doc={docId} ref={refCb} className="script-passo scroll-mt-20 lg:scroll-mt-4">
    <header className="flex items-center gap-4 mb-4">
      <span className="script-medalha" aria-hidden="true">{passo.n}</span>
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">Passo {passo.n}</p>
        <h2 className="script-h2 font-serif text-2xl sm:text-[1.7rem] leading-tight text-prosperus-navy-panel">{passo.nome}</h2>
      </div>
    </header>
    <PassoCorpo passo={passo} />
    {comentarios}
  </section>
);

export const DocumentoView: React.FC<{
  documento: Documento;
  ativo: boolean;
  multiplos: boolean;
  refFor: (key: string) => (el: HTMLElement | null) => void;
  comentariosDo: (passo: number) => React.ReactNode;
  premissa?: Premissa | null;
}> = ({ documento, ativo, multiplos, refFor, comentariosDo, premissa }) => (
  <section data-doc={documento.id} className={`script-doc ${ativo ? 'block' : 'hidden'} print:block`} aria-hidden={!ativo}>
    {multiplos && (
      <header className="script-doc-titulo mb-6 pb-3 border-b border-prosperus-gold-dark/50">
        <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">{documento.rotulo}</p>
        <h2 className="font-serif text-2xl text-prosperus-navy-panel leading-tight">{documento.titulo}</h2>
      </header>
    )}
    {documento.extras.filter((e) => e.titulo === 'Abertura').map((e) => (
      <div key={e.slug} className="script-md mb-6" dangerouslySetInnerHTML={{ __html: e.html }} />
    ))}
    {premissa && <div className="mb-8"><PremissaBox premissa={premissa} /></div>}
    <div className="space-y-10">
      {documento.passos.map((p) => (
        <PassoSection key={`${documento.id}-${p.n}`} passo={p} docId={documento.id} refCb={refFor(`${documento.id}-p${p.n}`)} comentarios={comentariosDo(p.n)} />
      ))}
    </div>
    {documento.extras.filter((e) => e.titulo !== 'Abertura').map((e) => (
      <section key={e.slug} className="script-extra mt-10">
        <h2 className="script-h2 font-serif text-2xl text-prosperus-navy-panel mb-3">{e.titulo}</h2>
        <div className="script-md" dangerouslySetInnerHTML={{ __html: e.html }} />
      </section>
    ))}
  </section>
);

export const ScriptPaper: React.FC<{
  doc: ScriptDoc;
  clubNome: string;
  versao: number | null;
  escritoEm: string;
  aprovadoEm?: string | null;
  docAtivo: string;
  refFor: (key: string) => (el: HTMLElement | null) => void;
  comentariosDo: (passo: number) => React.ReactNode;
  /** So estes documentos (ids d1/d2); sem a prop, todos. O mapa e o cartao saem com o campo; a premissa e as metricas com o treinamento. */
  apenas?: string[];
  /** Todos os documentos visiveis na tela (pagina de impressao), nao so o `docAtivo`. */
  todosVisiveis?: boolean;
}> = ({ doc, clubNome, versao, escritoEm, aprovadoEm, docAtivo, refFor, comentariosDo, apenas, todosVisiveis }) => {
  const multiplos = doc.documentos.length > 1;
  const documentos = apenas ? doc.documentos.filter((d) => apenas.includes(d.id)) : doc.documentos;
  const comCampo = !apenas || apenas.includes('d2') || documentos.length === doc.documentos.length;
  return (
    <article id="script-print-root" className="script-paper w-full max-w-[760px] mx-auto rounded-2xl px-5 py-7 sm:px-10 sm:py-10 shadow-2xl">
      <header className="script-titulo mb-6">
        <p className="text-[11px] uppercase tracking-[0.24em] text-prosperus-gold-dark font-semibold">{clubNome}</p>
        <h1 className="script-h1 font-serif text-3xl sm:text-[2.4rem] leading-tight text-prosperus-navy-panel mt-1">Script dos 7 passos da venda</h1>
        {doc.oferta && <p className="font-serif text-lg text-prosperus-navy-panel/80 mt-1">{doc.oferta}</p>}
        <p className="text-xs text-prosperus-navy-panel/60 mt-2">
          {versao != null ? `Versão ${versao}` : ''}
          {escritoEm ? ` · escrito em ${escritoEm}` : ''}
          {aprovadoEm ? ` · aprovado em ${aprovadoEm}` : ''}
        </p>
        <div className="script-rule mt-4" aria-hidden="true" />
      </header>

      {doc.cabecalho.length > 0 && (
        <dl className="script-cabecalho grid gap-x-6 gap-y-3 sm:grid-cols-2 mb-6">
          {doc.cabecalho.map((c, i) => (
            <div key={i}>
              <dt className="script-nota-rotulo">{c.rotulo}</dt>
              <dd className="text-[0.95rem] leading-relaxed text-prosperus-neutral-black">{comTags(c.valor)}</dd>
            </div>
          ))}
        </dl>
      )}

      {doc.comoUsar.length > 0 && (
        <aside className="script-como-usar mb-8">
          <Rotulo>Como usar este script</Rotulo>
          <ol className="space-y-1">
            {doc.comoUsar.map((l, i) => <li key={i} className="flex items-start leading-relaxed"><span className="script-num" aria-hidden="true">{i + 1}</span>{comTags(l)}</li>)}
          </ol>
        </aside>
      )}

      {doc.extras.map((e) => (
        <div key={e.slug} className="script-md mb-6" dangerouslySetInnerHTML={{ __html: e.html }} />
      ))}

      {documentos.map((d) => (
        <DocumentoView key={d.id} documento={d} ativo={todosVisiveis || d.id === docAtivo} multiplos={multiplos} refFor={refFor} comentariosDo={comentariosDo} premissa={d.id === doc.documentos[0]?.id ? doc.premissa : null} />
      ))}

      {comCampo && doc.mapa && <MapaSection mapa={doc.mapa} />}

      {comCampo && doc.cartao && <div className="mt-8"><CartaoView cartao={doc.cartao} montado={doc.cartaoMontado} id="script-cartao" /></div>}
    </article>
  );
};

export const MapaSection: React.FC<{ mapa: NonNullable<ScriptDoc['mapa']> }> = ({ mapa }) => (
  <section className="script-mapa mt-10">
    <h2 className="script-h2 font-serif text-2xl text-prosperus-navy-panel mb-3">{mapa.titulo}</h2>
    <div className="script-table script-md" dangerouslySetInnerHTML={{ __html: mapa.html }} />
  </section>
);

export default ScriptPaper;
