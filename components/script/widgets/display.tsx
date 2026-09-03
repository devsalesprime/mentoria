/**
 * Modo de exibição dos widgets da Ficha do Script: a estrutura (sugerida ou salva) vista como
 * pódio, colunas VS, cartas, escada de preço, baralho, linha do tempo etc. Só leitura; o editor
 * fica em SimpleWidgets / ListWidgets / StructuredWidgets / BaralhoWidget.
 */
import React from 'react';
import { CANAIS, NIVEL_LABEL, QUEM_VENDE, lacunaKeys, type WidgetType } from './estrutura';
import { Carrossel, Numero, Painel, ReguaLida, Rotulo, lista, type DisplayProps } from './ui';
import { moedaCompacta, totalAnual } from './numero';
import { useNumberTicker } from './NumberTicker';
import { textoLimpo } from './vazio';
import { IconeAspas, IconeCadeiras, IconeCheck, IconeDegraus, IconeMisto, IconeTelefone, IconeVideo } from '../contexto/icones';
import { PrateleiraDisplay } from './Prateleira';
import { ChaveFechaduraDisplay } from './ChaveFechadura';
import { DoisCaminhosDisplay } from './DoisCaminhos';
import { CapaLivroDisplay } from './CapaLivro';
import { RetornoDisplay } from './Retorno';
import { RadarDisplay } from './Radar';
import { MostradorDisplay } from './Mostrador';
import { DorPilarDisplay } from './DorPilar';
import { BalancaDisplay } from './Balanca';
import { LinhaTempoDisplay } from './LinhaTempo';
import { JanelaAnoDisplay } from './JanelaAno';

export type { DisplayProps };

/** Glifo da cena de cada canal (6.1): cadeiras, vídeo, telefone, dois sentidos. */
export const ICONE_CANAL: Record<string, React.ReactNode> = {
  presencial: <IconeCadeiras className="w-5 h-5" />,
  video: <IconeVideo className="w-5 h-5" />,
  ligacao: <IconeTelefone className="w-5 h-5" />,
  misto: <IconeMisto className="w-5 h-5" />,
};

const TXT = 'text-sm sm:text-base text-white/90 font-sans leading-relaxed whitespace-pre-line';

const Vazio: React.FC = () => <span className="text-white/30 italic font-sans text-sm">em branco</span>;

/** Texto de exibição: marcador ("a definir", "a confirmar", "não sei", "???") conta como vazio. */
const Texto: React.FC<{ v?: any; className?: string }> = ({ v, className = '' }) => {
  const s = textoLimpo(typeof v === 'string' ? v : v == null ? '' : String(v));
  return s ? <p className={`${TXT} ${className}`}>{s}</p> : <Vazio />;
};

/** Celula rotulada (rótulo pequeno em caixa alta + valor). */
const Celula: React.FC<{ label: string; v?: any; className?: string }> = ({ label, v, className = '' }) => (
  <div className={`min-w-0 space-y-0.5 ${className}`}>
    <Rotulo>{label}</Rotulo>
    <Texto v={v} />
  </div>
);

/** Chip só de leitura: marcado em dourado, os demais apagados. */
const ChipLido: React.FC<{ selected: boolean; children: React.ReactNode }> = ({ selected, children }) => (
  <span
    data-selected={selected ? 'true' : 'false'}
    className={`inline-flex items-center min-h-[36px] px-3.5 py-1.5 rounded-full text-sm font-sans border ${
      selected
        ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold'
        : 'border-white/10 text-white/35'
    }`}
  >
    {children}
  </span>
);

/** Carta de opção só de leitura (estado de rádio), com descrição curta e glifo opcionais. */
const CartaoLido: React.FC<{ selected: boolean; title: string; sub?: string; icone?: React.ReactNode }> = ({ selected, title, sub, icone }) => (
  <div
    data-selected={selected ? 'true' : 'false'}
    className={`rounded-lg border p-3 ${
      selected ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/60 text-white' : 'bg-white/[0.02] border-white/10 text-white/35'
    }`}
  >
    <span className="flex items-center gap-2">
      <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${selected ? 'border-prosperus-gold-dark' : 'border-white/20'}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-prosperus-gold-dark" />}
      </span>
      {icone && <span className={`shrink-0 ${selected ? 'text-prosperus-gold-light' : 'text-white/30'}`} aria-hidden="true">{icone}</span>}
      <span className="text-sm font-sans font-semibold">{title}</span>
    </span>
    {sub && <span className={`block text-[11px] font-sans mt-1 pl-6 ${selected ? 'text-white/60' : 'text-white/25'}`}>{sub}</span>}
  </div>
);

const moeda = (v: any) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  if (!s) return '';
  return /R\$/i.test(s) ? s : `R$ ${s}`;
};

// ── por widget ───────────────────────────────────────────────────────────────

const EscolhaDisplay: React.FC<DisplayProps> = ({ campo, template, value, ctx }) => {
  const opcoes = (ctx.opcoes || []).filter(Boolean);
  const isOutra = value.opcao === 'Outra';
  const escolhido = isOutra ? (value.texto || '').trim() : (value.opcao || value.texto || '').trim();
  const cartas = template.estilo === 'cartas' || template.estilo === 'radio';
  const todas = opcoes.includes(escolhido) || !escolhido ? opcoes : [...opcoes, escolhido];
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  const sub = (o: string) => {
    if (descricoes[o]) return descricoes[o];
    if (o === (campo.sugerido || '').trim() && campo.fonte) return `Fonte: ${campo.fonte}`;
    const alt = (campo.alternativas || []).find((a) => a.sugerido.trim() === o);
    return alt?.fonte ? `Fonte: ${alt.fonte}` : undefined;
  };
  if (!todas.length) return <Texto v={escolhido} className="font-semibold" />;
  return cartas ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {todas.map((o, i) => (
        <CartaoLido key={o} selected={o === escolhido} title={o} sub={sub(o)} icone={template.icones === 'degraus' ? <IconeDegraus n={(Math.min(3, i + 1)) as 1 | 2 | 3} className="w-6 h-6" /> : undefined} />
      ))}
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      {todas.map((o) => <ChipLido key={o} selected={o === escolhido}>{o}</ChipLido>)}
    </div>
  );
};

const MetaDisplay: React.FC<DisplayProps> = ({ value }) => {
  const b = (v: any) => <b className="text-prosperus-gold-light font-semibold">{v}</b>;
  const partes: React.ReactNode[] = [];
  if (value.clientes) partes.push(<span key="c">{b(value.clientes)} clientes</span>);
  if (value.ate) partes.push(<span key="a">até {b(value.ate)}</span>);
  const reun = value.reunioes ? <span key="r">{b(value.reunioes)} reuniões de venda por semana</span> : null;
  return (
    <div className="space-y-2">
      {(partes.length > 0 || reun) && (
        <p className="font-serif text-lg sm:text-xl text-white leading-snug">
          {partes.map((p, i) => <React.Fragment key={i}>{i > 0 && ' '}{p}</React.Fragment>)}
          {partes.length > 0 && reun && <span className="text-white/40"> · </span>}
          {reun}
        </p>
      )}
      {value.obs && <Texto v={value.obs} />}
    </div>
  );
};

/** frase; com template.estilo = 'citacao' (2.4, o propósito) vira cartão de citação assinado. */
const FraseDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const f = textoLimpo(value.frase);
  if (!f) return <Vazio />;
  if (template.estilo !== 'citacao') return <p className="font-serif text-lg sm:text-xl text-white leading-snug">{f}</p>;
  return (
    <figure className="rounded-lg border border-prosperus-gold-dark/40 bg-white/[0.03] p-4 sm:p-5 space-y-3" data-testid="citacao-assinada">
      <span className="text-prosperus-gold-dark" aria-hidden="true"><IconeAspas className="w-6 h-6" /></span>
      <blockquote className="font-serif text-lg sm:text-2xl text-white leading-snug">{f}</blockquote>
      <figcaption className="flex items-center gap-2">
        <span className="h-px w-10 bg-prosperus-gold-dark" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">{template.assinatura || 'na sua voz'}</span>
      </figcaption>
    </figure>
  );
};

/** lacunas: a frase-modelo com as lacunas preenchidas em dourado (ou o texto livre). */
const LacunasDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const livre = textoLimpo(value.livre);
  if (livre) return <p className="font-serif text-lg sm:text-xl text-white leading-snug">{livre}</p>;
  const modelo: string = typeof template.modelo === 'string' ? template.modelo : '';
  const lac: Record<string, string> = value.lacunas && typeof value.lacunas === 'object' ? value.lacunas : {};
  if (!lacunaKeys(modelo).some((k) => textoLimpo(lac[k]))) return <Vazio />;
  const partes = modelo.split(/(\[\w+\])/);
  return (
    <p className="font-serif text-lg sm:text-xl text-white leading-relaxed" data-testid="lacunas-lida">
      {partes.map((p, i) => {
        const m = p.match(/^\[(\w+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const v = textoLimpo(lac[m[1]]);
        return v
          ? <span key={m[1]} className="text-prosperus-gold-light border-b border-prosperus-gold-dark/60 px-0.5" data-lacuna={m[1]}>{v}</span>
          : <span key={m[1]} className="text-white/30 border-b border-white/20 px-2" data-lacuna={m[1]}>…</span>;
      })}
    </p>
  );
};

const TextoDisplay: React.FC<DisplayProps> = ({ value }) => <Texto v={value.texto} />;

// Pódio sem emoji: numeral em serifa dentro de um círculo na cor da medalha
const MEDALHAS = [
  { key: 'ouro', label: 'Ouro', medal: '1', border: 'border-medal-gold/50', text: 'text-medal-gold', order: 'md:order-2', pad: 'md:pt-6' },
  { key: 'prata', label: 'Prata', medal: '2', border: 'border-medal-silver/50', text: 'text-medal-silver', order: 'md:order-1', pad: '' },
  { key: 'bronze', label: 'Bronze', medal: '3', border: 'border-medal-bronze/50', text: 'text-medal-bronze', order: 'md:order-3', pad: '' },
];
const HistoriaPodioDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-3">
    {value.historia && <Texto v={value.historia} />}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
      {MEDALHAS.map((m) => (
        <div key={m.key} data-testid={`podio-${m.key}`} className={`bg-prosperus-navy-mid border ${m.border} rounded-lg p-3 flex md:flex-col items-start md:items-stretch gap-3 ${m.order} ${m.pad}`}>
          <span className={`w-9 h-9 md:mx-auto rounded-full border ${m.border} ${m.text} font-serif text-xl leading-none flex items-center justify-center shrink-0`} aria-hidden="true">{m.medal}</span>
          <div className="flex-1 min-w-0 space-y-1">
            <span className={`block text-xs font-semibold font-sans md:text-center ${m.text}`}>{m.label}</span>
            <div className="md:text-center"><Texto v={value[m.key]} /></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const VsDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const esquerda = template.esquerda || 'O mercado faz';
  const direita = template.direita || 'Eu faço';
  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0">
      <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg md:rounded-r-none p-3 space-y-2">
        <span className="block text-xs font-semibold text-white/50 tracking-widest uppercase font-sans">{esquerda}</span>
        <Texto v={value.mercado} />
      </div>
      <div className="flex items-center justify-center md:px-2">
        <span className="bg-white/10 rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold font-sans text-prosperus-gold-light border border-white/10" aria-hidden="true">VS</span>
      </div>
      <div className="flex-1 min-w-0 bg-prosperus-gold-dark/5 border border-prosperus-gold-dark/30 rounded-lg md:rounded-l-none p-3 space-y-2">
        <span className="block text-xs font-semibold text-prosperus-gold-dark tracking-widest uppercase font-sans">{direita}</span>
        <Texto v={value.eu} />
      </div>
    </div>
  );
};

/** Os 4 cortes do cliente ideal (3.1). */
export const CORTES_ICP: { key: string; label: string }[] = [
  { key: 'setor', label: 'Setor' },
  { key: 'papel', label: 'Papel' },
  { key: 'tamanho', label: 'Tamanho ou bolso' },
  { key: 'territorio', label: 'Território' },
];

/** Retrato em 4 cortes: um cartão dividido em 4 células, o valor de cada corte em serifa. */
const IcpDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-2" data-testid="retrato-icp">
    <div className="grid grid-cols-2 rounded-lg border border-prosperus-gold-dark/40 overflow-hidden bg-white/[0.03]">
      {CORTES_ICP.map((c, i) => {
        const v = textoLimpo(value[c.key]);
        return (
          <div key={c.key} data-testid={`retrato-${c.key}`} data-preenchido={v ? 'true' : 'false'} className={`min-w-0 p-3 space-y-1 ${i % 2 === 1 ? 'border-l border-white/10' : ''} ${i >= 2 ? 'border-t border-white/10' : ''}`}>
            <Rotulo className="!text-prosperus-gold-dark">{c.label}</Rotulo>
            {v ? <p className="font-serif text-base sm:text-lg text-white leading-snug break-words">{v}</p> : <Vazio />}
          </div>
        );
      })}
    </div>
    {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
  </div>
);

const ChipsTextoDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const fixos: string[] = Array.isArray(template.chips) ? template.chips : [];
  const marcados = lista<string>(value.chips);
  const todos = [...fixos, ...marcados.filter((c) => !fixos.includes(c))];
  return (
    <div className="space-y-2">
      {todos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {todos.map((c) => <ChipLido key={c} selected={marcados.includes(c)}>{c}</ChipLido>)}
        </div>
      )}
      {value.texto && <Texto v={value.texto} />}
    </div>
  );
};

/** Assinatura dos cartões de citação: a voz de quem fala (o cliente). */
export const COPY_VOZ_CLIENTE = 'nas palavras dele';

/** Cartões de citação com aspas grandes e a assinatura da voz do cliente; filete dourado quando template.filete = 'ouro' (o desejo, 3.4). */
const CitacoesDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const itens = lista<string>(value.citacoes).filter((c) => (c || '').trim());
  if (!itens.length) return <Vazio />;
  const filete = template.filete === 'ouro';
  return (
    <div className="space-y-2">
      {itens.map((c, i) => (
        <blockquote key={i} data-testid="citacao-lida" className={`bg-white/[0.03] border rounded-lg p-3 space-y-1 ${filete ? 'border-white/10 border-l-2 border-l-prosperus-gold-dark' : 'border-white/10'}`}>
          <div className="flex items-start gap-2">
            <span className="font-serif text-3xl text-prosperus-gold-dark/70 leading-none select-none -mt-1" aria-hidden="true">“</span>
            <p className="font-serif text-base sm:text-lg text-white/90 italic leading-snug">{c}<span className="text-prosperus-gold-dark/70 not-italic" aria-hidden="true">”</span></p>
          </div>
          <footer className="pl-6 text-[10px] uppercase tracking-widest text-white/40 font-sans">{template.voz || COPY_VOZ_CLIENTE}</footer>
        </blockquote>
      ))}
    </div>
  );
};

/** Rótulo do segundo campo de cada item da lista de bolso (3.8). */
export const COPY_USO_RESPOSTA = 'o que faço com a resposta';

/** Lista de bolso numerada; cada item pode dizer o que o mentor faz com a resposta. */
const ListaNumeradaDisplay: React.FC<DisplayProps> = ({ value }) => {
  const usos = lista<string>(value.usos);
  const itens = lista<string>(value.itens).map((it, i) => ({ item: (it || '').trim(), uso: (usos[i] || '').trim() })).filter((x) => x.item);
  if (!itens.length) return <Vazio />;
  return (
    <ol className="space-y-2">
      {itens.map((x, i) => (
        <li key={i} className="flex items-start gap-3" data-testid="lista-item">
          <Numero n={i + 1} />
          <div className="min-w-0 pt-0.5 space-y-0.5">
            <p className={TXT}>{x.item}</p>
            {x.uso && <p className="text-xs text-prosperus-gold-light/80 font-sans" data-testid="lista-uso"><span className="uppercase tracking-wide text-[10px] text-prosperus-gold-dark">{COPY_USO_RESPOSTA}: </span>{x.uso}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
};

const TabelaDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const cols: { key: string; label: string; tipo?: string }[] = Array.isArray(template.colunas) ? template.colunas : [];
  const linhas = lista<Record<string, string>>(value.linhas).filter((r) => cols.some((c) => (r?.[c.key] || '').trim()));
  if (!linhas.length || !cols.length) return <Vazio />;
  const grid = cols.length === 2 ? 'sm:grid-cols-[1.4fr_1fr]' : cols.length === 3 ? 'sm:grid-cols-[1.2fr_1fr_1fr]' : 'sm:grid-cols-1';
  return (
    <div className="space-y-2 sm:space-y-0 sm:rounded-lg sm:border sm:border-white/10 sm:overflow-hidden">
      <div className={`hidden sm:grid ${grid} gap-3 px-3 py-2 bg-white/5`}>
        {cols.map((c) => <Rotulo key={c.key}>{c.label}</Rotulo>)}
      </div>
      {linhas.map((r, i) => (
        <div key={i} data-testid="tabela-linha" className={`grid grid-cols-1 ${grid} gap-x-3 gap-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:rounded-none sm:border-0 sm:border-t sm:border-white/10 sm:bg-transparent`}>
          {cols.map((c) => (
            <div key={c.key} className="min-w-0">
              <Rotulo className="sm:hidden mb-0.5">{c.label}</Rotulo>
              <Texto v={c.tipo === 'moeda' ? moeda(r[c.key]) : r[c.key]} className="!text-sm" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/** Baralho de objeções (só leitura): a objeção em aspas e, embaixo, o que você responde. */
const BaralhoDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const cols: { key: string; label: string }[] = Array.isArray(template.colunas) ? template.colunas : [];
  const kO = cols[0]?.key || 'objecao';
  const kR = cols[1]?.key || 'resposta';
  const linhas = lista<Record<string, string>>(value.linhas).filter((r) => (r?.[kO] || '').trim() || (r?.[kR] || '').trim());
  if (!linhas.length) return <Vazio />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {linhas.map((r, i) => (
        <div key={i} data-testid="carta-objecao" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="font-serif text-3xl text-prosperus-gold-dark/70 leading-none select-none -mt-1" aria-hidden="true">“</span>
            <p className="font-serif text-base text-white/90 italic leading-snug">{textoLimpo(r[kO]) || <Vazio />}</p>
          </div>
          <div className="border-t border-prosperus-gold-dark/30 pt-2 space-y-0.5">
            <Rotulo className="!text-prosperus-gold-dark">{cols[1]?.label || 'O que você responde hoje'}</Rotulo>
            <Texto v={r[kR]} className="!text-sm" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Escada de etapas (4.2): no celular, linha vertical com os degraus; no desktop os degraus sobem da
 * esquerda para a direita (cada cartão um pouco mais alto que o anterior), nome + o que resolve.
 */
const PilaresDisplay: React.FC<DisplayProps> = ({ value }) => {
  const ps = lista<{ nome: string; resolve: string }>(value.pilares).filter((p) => (p?.nome || '').trim() || (p?.resolve || '').trim());
  if (!ps.length) return <Vazio />;
  const n = ps.length;
  const passo = n > 5 ? 8 : 14;
  return (
    <ol className="relative ml-3.5 border-l border-prosperus-gold-dark/30 space-y-4 md:ml-0 md:border-0 md:grid md:gap-3 md:space-y-0 md:items-end" style={{ gridTemplateColumns: `repeat(${Math.min(n, 4)}, minmax(0, 1fr))` }} data-testid="escada-etapas">
      {ps.map((p, i) => (
        <li key={i} data-testid="pilar" data-degrau={i + 1} className="relative pl-6 md:pl-0 md:rounded-lg md:border md:border-white/10 md:bg-white/[0.03] md:p-3 md:min-h-[96px]">
          <span className="absolute -left-[15px] top-0 md:static md:mb-1 md:inline-block"><Numero n={i + 1} /></span>
          <span className="hidden md:block h-1 rounded-full bg-prosperus-gold-dark/40 mb-2" style={{ width: `${40 + (i % 4) * passo}%` }} aria-hidden="true" />
          <p className="text-sm sm:text-base font-sans font-semibold text-white leading-snug pt-1 md:pt-0">{p.nome || `Etapa ${i + 1}`}</p>
          {p.resolve && <p className="text-sm text-white/70 font-sans leading-relaxed">{p.resolve}</p>}
        </li>
      ))}
    </ol>
  );
};

const EscolhaDeListaDisplay: React.FC<DisplayProps> = ({ value, ctx }) => {
  const opcoes = (ctx.pilares || []).filter(Boolean);
  const escolhido = (value.escolhido || '').trim();
  if (escolhido) {
    const todas = opcoes.includes(escolhido) ? opcoes : [...opcoes, escolhido];
    return (
      <div className="flex flex-wrap gap-2">
        {todas.map((o) => <ChipLido key={o} selected={o === escolhido}>{o}</ChipLido>)}
      </div>
    );
  }
  return <Texto v={value.texto} className="font-semibold" />;
};

/** Rótulo do total do primeiro ano de um degrau. */
export const COPY_NO_ANO = 'no ano';

/** "R$ 168 mil no ano": o total do primeiro ano de um degrau, rodando até o número (só quando o valor diz o período). */
export const TotalAnual: React.FC<{ valor?: string; textos?: (string | undefined)[]; className?: string; testId?: string }> = ({ valor, textos = [], className = '', testId }) => {
  const total = totalAnual(valor, ...textos);
  const n = useNumberTicker(total ?? 0);
  if (total == null) return null;
  return (
    <p className={`text-xs font-sans text-white/60 ${className}`} data-testid={testId} data-total={total}>
      <span className="font-serif text-sm text-prosperus-gold-light tabular-nums">{moedaCompacta(n)}</span> {COPY_NO_ANO}
    </p>
  );
};

/** Escada de preço: 3 degraus, o de cima maior e dourado (é por ele que se ancora), cada um com o total anual. */
const DEGRAUS_VIS: { key: 'alta' | 'media' | 'entrada'; n: number; sub: string; gold: boolean; alt: string }[] = [
  { key: 'alta', n: 3, sub: 'ancore por aqui', gold: true, alt: 'md:mt-0 md:pb-6' },
  { key: 'media', n: 2, sub: '', gold: false, alt: 'md:mt-8' },
  { key: 'entrada', n: 1, sub: 'a porta', gold: false, alt: 'md:mt-16' },
];
const EscadaDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-start">
      {DEGRAUS_VIS.map((n) => {
        const nv = value[n.key] || {};
        return (
          <div key={n.key} className={n.alt} data-testid={`escada-degrau-${n.key}`} data-degrau={n.n}>
            <Painel accent={n.gold ? 'gold' : 'muted'} className={`space-y-1 ${n.gold ? 'md:shadow-lg md:shadow-prosperus-gold-dark/10' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <Numero n={n.n} gold={n.gold} />
                  <span className={`text-[11px] uppercase tracking-wide font-sans ${n.gold ? 'text-prosperus-gold-dark' : 'text-white/50'}`}>{NIVEL_LABEL[n.key]}</span>
                </span>
                {n.sub && <span className="text-[10px] text-white/40 font-sans">{n.sub}</span>}
              </div>
              <p className={`font-serif text-base ${n.gold ? 'text-prosperus-gold-light' : 'text-white'}`}>{(nv.nome || '').trim() || <Vazio />}</p>
              <p data-testid={`escada-${n.key}-valor`} className={`font-serif text-white ${n.gold ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{moeda(nv.valor) || <Vazio />}</p>
              <TotalAnual valor={nv.valor} textos={[nv.nome, nv.muda]} testId={`escada-${n.key}-ano`} />
              {nv.muda && <p className="text-sm text-white/70 font-sans leading-relaxed">{nv.muda}</p>}
            </Painel>
          </div>
        );
      })}
    </div>
    {value.condicao && <Celula label="Condição de entrada" v={value.condicao} />}
    {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
  </div>
);

const CONDICOES: { key: string; label: string; detail: string; sufixo?: string }[] = [
  { key: 'avista', label: 'À vista', detail: 'desconto' },
  { key: 'parcelado', label: 'Parcelado', detail: 'vezes', sufixo: 'x' },
  { key: 'contrato', label: 'Contrato', detail: 'meses', sufixo: ' meses' },
  { key: 'contrapartida', label: 'Contrapartida para desconto', detail: 'texto' },
  { key: 'garantia', label: 'Garantia', detail: 'texto' },
];
/** Mesa de negociação: as condições como cartas (2 por linha no celular), a marcada em dourado com o valor. */
const ChecklistCondicoesDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="mesa-condicoes">
      {CONDICOES.map((c) => {
        const item = value[c.key] || {};
        const on = !!item.ativo;
        const detalhe = (item[c.detail] || '').toString().trim();
        return (
          <div key={c.key} data-testid={`condicao-${c.key}`} data-selected={on ? 'true' : 'false'} className={`min-w-0 rounded-lg border p-3 min-h-[88px] flex flex-col gap-2 ${on ? 'border-prosperus-gold-dark/50 bg-prosperus-gold-dark/10' : 'border-white/10 bg-white/[0.02]'}`}>
            <span aria-hidden="true" className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? 'bg-prosperus-gold-dark border-prosperus-gold-dark text-black' : 'border-white/20 text-transparent'}`}><IconeCheck /></span>
            <span className={`text-sm font-sans leading-tight ${on ? 'text-white font-semibold' : 'text-white/40'}`}>{c.label}</span>
            {on && (detalhe
              ? <span className="font-serif text-base text-prosperus-gold-light break-words">{detalhe}{c.sufixo || ''}</span>
              : <span className="text-xs text-white/50 font-sans">sim</span>)}
          </div>
        );
      })}
    </div>
    {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
  </div>
);

/** Números rotulados; um campo com `slider` (6.7, os dias) vira régua de leitura com o ponteiro no valor. */
const DoisNumerosDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const campos: { key: string; label: string; tipo?: string; slider?: { min: number; max: number; marcas?: number[] } }[] = Array.isArray(template.campos) ? template.campos : [];
  const simples = campos.filter((c) => !c.slider);
  const reguas = campos.filter((c) => c.slider);
  const cols = simples.length === 1 ? 'sm:grid-cols-1' : simples.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 ${cols} gap-3`}>
        {simples.map((c) => {
          const v = (value[c.key] || '').toString().trim();
          return (
            <Painel key={c.key} accent="muted" className="space-y-0.5">
              <Rotulo>{c.label}</Rotulo>
              <p className="font-serif text-xl sm:text-2xl text-prosperus-gold-light">{v ? (c.tipo === 'moeda' ? moeda(v) : v) : <Vazio />}</p>
            </Painel>
          );
        })}
      </div>
      {reguas.map((c) => {
        const n = parseInt((value[c.key] || '').toString(), 10);
        const s = c.slider!;
        return (
          <Painel key={c.key} accent="muted" className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <Rotulo>{c.label}</Rotulo>
              <span className="font-serif text-xl text-prosperus-gold-light">{Number.isNaN(n) ? <Vazio /> : n}</span>
            </div>
            <ReguaLida value={Number.isNaN(n) ? null : n} min={s.min} max={s.max} marcas={s.marcas} label={c.label} testId={`regua-${c.key}`} />
          </Painel>
        );
      })}
      {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
    </div>
  );
};

const CamposRotuladosDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const campos: { key: string; label: string }[] = Array.isArray(template.campos) ? template.campos : [];
  return (
    <div className={`grid grid-cols-1 ${template.multiline ? 'md:grid-cols-2' : 'sm:grid-cols-2'} gap-3`}>
      {campos.map((c) => (
        <Painel key={c.key} accent="muted"><Celula label={c.label} v={value[c.key]} /></Painel>
      ))}
    </div>
  );
};

const CanalDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CANAIS.map((c) => <CartaoLido key={c.id} selected={value.canal === c.id} title={c.label} sub={descricoes[c.id]} icone={ICONE_CANAL[c.id]} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Painel accent="muted" className="space-y-0.5">
          <Rotulo>Duração</Rotulo>
          <p className="font-serif text-xl text-prosperus-gold-light">{value.duracao ? `${value.duracao} min` : <Vazio />}</p>
        </Painel>
        <Painel accent="muted" className="space-y-0.5">
          <Rotulo>Reuniões</Rotulo>
          <p className="font-serif text-xl text-prosperus-gold-light">{value.reunioes || <Vazio />}</p>
        </Painel>
      </div>
      {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
    </div>
  );
};

/** Quem conduz a venda (carta marcada), o nome e a origem do lead. */
const QuemVendeDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  return (
    <div className="space-y-3" data-testid="quem-vende-lido">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {QUEM_VENDE.map((q) => <CartaoLido key={q.id} selected={value.quem === q.id} title={q.label} sub={descricoes[q.id]} />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Celula label="Nome de quem vende" v={value.nome} />
        <Celula label="De onde vem o lead" v={value.origem_lead} />
      </div>
    </div>
  );
};

/** Cartões de prova num carrossel: perfil, antes → depois, "pode citar". */
const CasosDisplay: React.FC<DisplayProps> = ({ value }) => {
  const cs = lista<{ nome: string; antes: string; depois: string; citar: string }>(value.casos).filter((c) => (c?.nome || '').trim() || (c?.antes || '').trim() || (c?.depois || '').trim());
  if (!cs.length) return <Vazio />;
  const cartas = cs.map((c, i) => (
    <div key={i} data-testid="caso" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2 h-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm sm:text-base font-sans font-semibold text-white">{c.nome || `Caso ${i + 1}`}</p>
        {c.citar === 'sim' && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-sans">pode citar</span>}
        {c.citar === 'nao' && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">sem citar o nome</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:items-start">
        <Celula label="Antes" v={c.antes} />
        <span className="hidden sm:block self-center text-prosperus-gold-dark font-serif text-xl" aria-hidden="true">→</span>
        <Celula label="Depois" v={c.depois} />
      </div>
    </div>
  ));
  return <Carrossel itens={cartas} label="Casos reais" nomeItem="caso" testId="carrossel-casos-lido" />;
};

export const DISPLAYS: Record<WidgetType, React.FC<DisplayProps>> = {
  escolha: EscolhaDisplay,
  meta: MostradorDisplay,
  frase: FraseDisplay,
  lacunas: LacunasDisplay,
  texto: TextoDisplay,
  antes_depois: JanelaAnoDisplay,
  historia_podio: LinhaTempoDisplay,
  vs: BalancaDisplay,
  icp: IcpDisplay,
  chips_texto: ChipsTextoDisplay,
  citacoes: CitacoesDisplay,
  lista_numerada: ListaNumeradaDisplay,
  tabela: TabelaDisplay,
  baralho: BaralhoDisplay,
  pilares: PilaresDisplay,
  escolha_de_lista: DorPilarDisplay,
  escada: EscadaDisplay,
  checklist_condicoes: ChecklistCondicoesDisplay,
  dois_numeros: DoisNumerosDisplay,
  dois_campos: CamposRotuladosDisplay,
  dois_textos: CamposRotuladosDisplay,
  canal: CanalDisplay,
  casos: CasosDisplay,
  quem_vende: QuemVendeDisplay,
  prateleira: PrateleiraDisplay,
  chave_fechadura: ChaveFechaduraDisplay,
  retorno: RetornoDisplay,
  radar: RadarDisplay,
  dois_caminhos: DoisCaminhosDisplay,
  capa_livro: CapaLivroDisplay,
};

// Os visuais genéricos seguem exportados para quem precisar do modo simples (e para testes).
export { MetaDisplay, HistoriaPodioDisplay, VsDisplay, EscolhaDeListaDisplay, TextoDisplay };

/** Texto corrido (sem widget ou parse que não estruturou): bloco de citação com nota opcional. */
export const TextoBruto: React.FC<{ texto: string; tipo?: string; nota?: string; testId?: string }> = ({ texto, tipo, nota, testId }) => {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const asList = tipo === 'ls' && linhas.length > 1;
  return (
    <div data-testid={testId} className="border-l-2 border-prosperus-gold-dark/50 bg-prosperus-navy-mid/70 rounded-r-lg p-3 space-y-1">
      {nota && <p className="text-[11px] text-prosperus-gold-light/80 font-sans">{nota}</p>}
      {asList ? (
        <ul className="list-disc pl-5 space-y-1 text-sm text-white/90 font-sans leading-relaxed">
          {linhas.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-white/90 font-sans leading-relaxed whitespace-pre-line">{texto}</p>
      )}
    </div>
  );
};
