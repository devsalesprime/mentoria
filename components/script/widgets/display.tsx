/**
 * Modo de exibição dos widgets da Ficha do Script: a estrutura (sugerida ou salva) vista como
 * pódio, colunas VS, cartões, escada de preço, linha do tempo etc. Só leitura; o editor
 * fica em SimpleWidgets / ListWidgets / StructuredWidgets.
 */
import React from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import { CANAIS, NIVEL_LABEL, type Estrutura, type ParseContext, type WidgetTemplate, type WidgetType } from './estrutura';
import { Numero, Painel, Rotulo, lista } from './ui';
import { textoLimpo } from './vazio';

export interface DisplayProps {
  campo: ScriptFieldView;
  template: WidgetTemplate;
  value: Estrutura;
  ctx: ParseContext;
}

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

/** Cartão de opção só de leitura (estado de rádio). */
const CartaoLido: React.FC<{ selected: boolean; title: string }> = ({ selected, title }) => (
  <div
    data-selected={selected ? 'true' : 'false'}
    className={`rounded-lg border p-3 flex items-center gap-2 ${
      selected ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/60 text-white' : 'bg-white/[0.02] border-white/10 text-white/35'
    }`}
  >
    <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${selected ? 'border-prosperus-gold-dark' : 'border-white/20'}`}>
      {selected && <span className="w-2 h-2 rounded-full bg-prosperus-gold-dark" />}
    </span>
    <span className="text-sm font-sans font-semibold">{title}</span>
  </div>
);

const moeda = (v: any) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  if (!s) return '';
  return /R\$/i.test(s) ? s : `R$ ${s}`;
};

// ── por widget ───────────────────────────────────────────────────────────────

const EscolhaDisplay: React.FC<DisplayProps> = ({ template, value, ctx }) => {
  const opcoes = (ctx.opcoes || []).filter(Boolean);
  const isOutra = value.opcao === 'Outra';
  const escolhido = isOutra ? (value.texto || '').trim() : (value.opcao || value.texto || '').trim();
  const radio = template.estilo === 'radio';
  const todas = opcoes.includes(escolhido) || !escolhido ? opcoes : [...opcoes, escolhido];
  if (!todas.length) return <Texto v={escolhido} className="font-semibold" />;
  return radio ? (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {todas.map((o) => <CartaoLido key={o} selected={o === escolhido} title={o} />)}
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

const FraseDisplay: React.FC<DisplayProps> = ({ value }) => {
  const f = textoLimpo(value.frase);
  return f ? <p className="font-serif text-lg sm:text-xl text-white leading-snug">{f}</p> : <Vazio />;
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

const IcpDisplay: React.FC<DisplayProps> = ({ value }) => (
  <Painel accent="muted">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Celula label="Setor" v={value.setor} />
      <Celula label="Papel" v={value.papel} />
      <Celula label="Tamanho ou bolso" v={value.tamanho} />
      <Celula label="Território" v={value.territorio} />
    </div>
    {value.obs && <Texto v={value.obs} className="border-t border-white/10 pt-2 !text-sm" />}
  </Painel>
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

const CitacoesDisplay: React.FC<DisplayProps> = ({ value }) => {
  const itens = lista<string>(value.citacoes).filter((c) => (c || '').trim());
  if (!itens.length) return <Vazio />;
  return (
    <div className="space-y-2">
      {itens.map((c, i) => (
        <blockquote key={i} className="flex items-start gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <span className="font-serif text-2xl text-prosperus-gold-dark/70 leading-none select-none" aria-hidden="true">“</span>
          <p className="font-serif text-base text-white/90 italic leading-snug">{c}</p>
        </blockquote>
      ))}
    </div>
  );
};

const ListaNumeradaDisplay: React.FC<DisplayProps> = ({ value }) => {
  const itens = lista<string>(value.itens).filter((c) => (c || '').trim());
  if (!itens.length) return <Vazio />;
  return (
    <ol className="space-y-2">
      {itens.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <Numero n={i + 1} />
          <p className={`${TXT} pt-0.5`}>{it}</p>
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

const PilaresDisplay: React.FC<DisplayProps> = ({ value }) => {
  const ps = lista<{ nome: string; resolve: string }>(value.pilares).filter((p) => (p?.nome || '').trim() || (p?.resolve || '').trim());
  if (!ps.length) return <Vazio />;
  return (
    <ol className="relative ml-3.5 border-l border-prosperus-gold-dark/30 space-y-4">
      {ps.map((p, i) => (
        <li key={i} data-testid="pilar" className="relative pl-6">
          <span className="absolute -left-[15px] top-0"><Numero n={i + 1} /></span>
          <p className="text-sm sm:text-base font-sans font-semibold text-white leading-snug pt-1">{p.nome || `Etapa ${i + 1}`}</p>
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

const NIVEIS: { key: 'alta' | 'media' | 'entrada'; sub: string; gold: boolean }[] = [
  { key: 'alta', sub: 'ancore por aqui', gold: true },
  { key: 'media', sub: '', gold: false },
  { key: 'entrada', sub: 'a porta', gold: false },
];
const EscadaDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {NIVEIS.map((n) => {
        const nv = value[n.key] || {};
        return (
          <Painel key={n.key} accent={n.gold ? 'gold' : 'muted'} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[11px] uppercase tracking-wide font-sans ${n.gold ? 'text-prosperus-gold-dark' : 'text-white/50'}`}>{NIVEL_LABEL[n.key]}</span>
              {n.sub && <span className="text-[10px] text-white/40 font-sans">{n.sub}</span>}
            </div>
            <p className={`font-serif text-base ${n.gold ? 'text-prosperus-gold-light' : 'text-white'}`}>{(nv.nome || '').trim() || <Vazio />}</p>
            <p data-testid={`escada-${n.key}-valor`} className="font-serif text-xl sm:text-2xl text-white">{moeda(nv.valor) || <Vazio />}</p>
            {nv.muda && <p className="text-sm text-white/70 font-sans leading-relaxed">{nv.muda}</p>}
          </Painel>
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
const ChecklistCondicoesDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-2">
    {CONDICOES.map((c) => {
      const item = value[c.key] || {};
      const on = !!item.ativo;
      const detalhe = (item[c.detail] || '').toString().trim();
      return (
        <div key={c.key} data-selected={on ? 'true' : 'false'} className={`rounded-lg border p-3 flex items-center gap-3 ${on ? 'border-prosperus-gold-dark/40 bg-prosperus-gold-dark/5' : 'border-white/10 bg-white/[0.02]'}`}>
          <span aria-hidden="true" className={`w-6 h-6 rounded-md border flex items-center justify-center text-sm font-bold flex-shrink-0 ${on ? 'bg-prosperus-gold-dark border-prosperus-gold-dark text-black' : 'border-white/20 text-transparent'}`}>✓</span>
          <span className={`text-sm font-sans ${on ? 'text-white font-semibold' : 'text-white/40'}`}>{c.label}</span>
          {on && detalhe && <span className="text-sm text-white/80 font-sans ml-auto text-right">{detalhe}{c.sufixo || ''}</span>}
        </div>
      );
    })}
    {value.obs && <Texto v={value.obs} className="!text-sm text-white/70" />}
  </div>
);

const DoisNumerosDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const campos: { key: string; label: string; tipo?: string }[] = Array.isArray(template.campos) ? template.campos : [];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {campos.map((c) => {
          const v = (value[c.key] || '').toString().trim();
          return (
            <Painel key={c.key} accent="muted" className="space-y-0.5">
              <Rotulo>{c.label}</Rotulo>
              <p className="font-serif text-xl sm:text-2xl text-prosperus-gold-light">{v ? (c.tipo === 'moeda' ? moeda(v) : v) : <Vazio />}</p>
            </Painel>
          );
        })}
      </div>
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

const CanalDisplay: React.FC<DisplayProps> = ({ value }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CANAIS.map((c) => <CartaoLido key={c.id} selected={value.canal === c.id} title={c.label} />)}
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

const CasosDisplay: React.FC<DisplayProps> = ({ value }) => {
  const cs = lista<{ nome: string; antes: string; depois: string; citar: string }>(value.casos).filter((c) => (c?.nome || '').trim() || (c?.antes || '').trim() || (c?.depois || '').trim());
  if (!cs.length) return <Vazio />;
  return (
    <div className="space-y-3">
      {cs.map((c, i) => (
        <div key={i} data-testid="caso" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm sm:text-base font-sans font-semibold text-white">{c.nome || `Caso ${i + 1}`}</p>
            {c.citar === 'sim' && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-sans">pode citar</span>}
            {c.citar === 'nao' && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">sem citar o nome</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Celula label="Antes" v={c.antes} />
            <Celula label="Depois" v={c.depois} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const DISPLAYS: Record<WidgetType, React.FC<DisplayProps>> = {
  escolha: EscolhaDisplay,
  meta: MetaDisplay,
  frase: FraseDisplay,
  texto: TextoDisplay,
  antes_depois: TextoDisplay,
  historia_podio: HistoriaPodioDisplay,
  vs: VsDisplay,
  icp: IcpDisplay,
  chips_texto: ChipsTextoDisplay,
  citacoes: CitacoesDisplay,
  lista_numerada: ListaNumeradaDisplay,
  tabela: TabelaDisplay,
  pilares: PilaresDisplay,
  escolha_de_lista: EscolhaDeListaDisplay,
  escada: EscadaDisplay,
  checklist_condicoes: ChecklistCondicoesDisplay,
  dois_numeros: DoisNumerosDisplay,
  dois_campos: CamposRotuladosDisplay,
  dois_textos: CamposRotuladosDisplay,
  canal: CanalDisplay,
  casos: CasosDisplay,
};

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
