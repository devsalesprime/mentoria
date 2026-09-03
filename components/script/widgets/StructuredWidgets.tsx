import React from 'react';
import { NIVEL_LABEL } from './estrutura';
import { Area, BotaoAdd, BotaoIcone, Campo, Carrossel, CartaoOpcao, Contador, Entrada, Numero, Observacao, Painel, Rotulo, TAP, lista, move, type WidgetProps } from './ui';
import { TotalAnual } from './display';
import { IconeCheck, IconeSeta, IconeX } from '../contexto/icones';

/** historia_podio: textarea "história" + 3 cartoes ouro / prata / bronze (estilo do pódio do MentorModule). */
// Pódio sem emoji: numeral em serifa dentro de um círculo na cor da medalha
const MEDALHAS = [
  { key: 'ouro', label: 'Ouro', medal: '1', border: 'border-medal-gold/50', text: 'text-medal-gold', elevated: true },
  { key: 'prata', label: 'Prata', medal: '2', border: 'border-medal-silver/50', text: 'text-medal-silver', elevated: false },
  { key: 'bronze', label: 'Bronze', medal: '3', border: 'border-medal-bronze/50', text: 'text-medal-bronze', elevated: false },
];
export const HistoriaPodioWidget: React.FC<WidgetProps> = ({ campo, value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <Campo label="Sua história" hint="O que na sua trajetória te legitima a ensinar isso.">
        <Area value={value.historia || ''} onChange={(e) => set('historia', e.target.value)} rows={3} aria-label={`Editar ${campo.nome}`} placeholder="Comece pelo que você viveu" />
      </Campo>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
        {MEDALHAS.map((m) => (
          <div key={m.key} className={`bg-prosperus-navy-mid border ${m.border} rounded-lg p-3 flex md:flex-col items-start md:items-stretch gap-2 ${m.elevated ? 'md:pt-5' : ''}`}>
            <span className={`w-9 h-9 md:mx-auto rounded-full border ${m.border} ${m.text} font-serif text-xl leading-none flex items-center justify-center shrink-0`} aria-hidden="true">{m.medal}</span>
            <div className="flex-1 space-y-1">
              <span className={`block text-xs font-semibold font-sans md:text-center ${m.text}`}>{m.label}</span>
              <Area value={value[m.key] || ''} onChange={(e) => set(m.key, e.target.value)} rows={2} aria-label={`Prova ${m.label}`} placeholder="Uma conquista contada" />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/40 font-sans italic">Resultados, não credenciais: "ajudei 200 clínicas a sair do balcão" vale mais que "MBA".</p>
    </div>
  );
};

/** vs: duas colunas "O mercado faz" × "Eu faço" (estilo VS do MentorModule). */
export const VsWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const esquerda = template.esquerda || 'O mercado faz';
  const direita = template.direita || 'Eu faço';
  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0">
      <div className="flex-1 bg-white/5 border border-white/10 rounded-lg md:rounded-r-none p-3 space-y-2">
        <span className="block text-xs font-semibold text-white/50 tracking-widest uppercase font-sans">{esquerda}</span>
        <Area value={value.mercado || ''} onChange={(e) => set('mercado', e.target.value)} rows={4} aria-label={esquerda} placeholder="O padrão do seu mercado" />
      </div>
      <div className="flex items-center justify-center md:px-2">
        <span className="bg-white/10 rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold font-sans text-prosperus-gold-light border border-white/10" aria-hidden="true">VS</span>
      </div>
      <div className="flex-1 bg-prosperus-gold-dark/5 border border-prosperus-gold-dark/30 rounded-lg md:rounded-l-none p-3 space-y-2">
        <span className="block text-xs font-semibold text-prosperus-gold-dark tracking-widest uppercase font-sans">{direita}</span>
        <Area value={value.eu || ''} onChange={(e) => set('eu', e.target.value)} rows={4} aria-label={`Editar ${campo.nome}`} placeholder="O que você faz diferente" />
      </div>
    </div>
  );
};

/** pilares: escada de etapas (nome · o que resolve), 3 a 8; cada degrau sobe um pouco mais, e as setas reordenam. */
export const PilaresWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const min: number = template.min || 3;
  const max: number = template.max || 8;
  const ps = lista<{ nome: string; resolve: string }>(value.pilares);
  const rows = ps.length < min ? [...ps, ...Array(min - ps.length).fill(null).map(() => ({ nome: '', resolve: '' }))] : ps;
  const update = (next: { nome: string; resolve: string }[]) => onChange({ pilares: next });
  const set = (i: number, k: 'nome' | 'resolve', v: string) => { const next = rows.map((p) => ({ ...p })); next[i][k] = v; update(next); };
  const passo = rows.length > 5 ? 6 : 10;
  return (
    <div className="space-y-2" data-testid="escada-etapas-editor">
      {rows.map((p, i) => (
        <div key={i} data-testid={`degrau-editor-${i + 1}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-3 flex gap-2 items-start relative overflow-hidden">
          <span className="absolute left-0 top-0 h-full w-1 bg-prosperus-gold-dark/50" style={{ opacity: 0.35 + Math.min(0.65, (i * passo) / 100 * 1.6) }} aria-hidden="true" />
          <div className="pt-2 pl-1"><Numero n={i + 1} /></div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Entrada value={p.nome || ''} onChange={(e) => set(i, 'nome', e.target.value)} aria-label={`${campo.nome}: nome da etapa ${i + 1}`} placeholder="Nome da etapa" />
            <Entrada value={p.resolve || ''} onChange={(e) => set(i, 'resolve', e.target.value)} aria-label={`${campo.nome}: o que a etapa ${i + 1} resolve`} placeholder="O que ela resolve" />
          </div>
          <div className="flex flex-col sm:flex-row gap-0.5">
            <BotaoIcone onClick={() => update(move(rows, i, i - 1))} label={`Subir etapa ${i + 1}`} disabled={i === 0}><IconeSeta direcao="cima" /></BotaoIcone>
            <BotaoIcone onClick={() => update(move(rows, i, i + 1))} label={`Descer etapa ${i + 1}`} disabled={i === rows.length - 1}><IconeSeta direcao="baixo" /></BotaoIcone>
            <BotaoIcone onClick={() => update(rows.filter((_, k) => k !== i))} label={`Remover etapa ${i + 1}`} disabled={rows.length <= 1}><IconeX /></BotaoIcone>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((p) => (p.nome || '').trim()).length} min={min} max={max} unidade="etapas" />
        {rows.length < max && <BotaoAdd onClick={() => update([...rows, { nome: '', resolve: '' }])}>+ Etapa</BotaoAdd>}
      </div>
    </div>
  );
};

/**
 * escada: 3 degraus (mais alta no topo, intermediária, entrada embaixo), cada um com nome + R$ + "o que muda";
 * o degrau de cima é maior e dourado: é por ele que se ancora. Embaixo, a condição de entrada.
 */
export const DEGRAUS: { key: 'alta' | 'media' | 'entrada'; n: number; sub: string; gold: boolean; alt: string }[] = [
  { key: 'alta', n: 3, sub: 'ancore por aqui', gold: true, alt: 'md:mt-0 md:pb-6' },
  { key: 'media', n: 2, sub: 'o meio do caminho', gold: false, alt: 'md:mt-8' },
  { key: 'entrada', n: 1, sub: 'a porta', gold: false, alt: 'md:mt-16' },
];
export const EscadaWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const setNivel = (n: string, k: string, v: string) => onChange({ ...value, [n]: { ...(value[n] || {}), [k]: v } });
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-start">
        {DEGRAUS.map((n) => {
          const nv = value[n.key] || {};
          return (
            <div key={n.key} className={n.alt} data-testid={`escada-degrau-${n.key}`}>
              <Painel accent={n.gold ? 'gold' : 'muted'} className={n.gold ? 'md:shadow-lg md:shadow-prosperus-gold-dark/10' : ''}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <Numero n={n.n} gold={n.gold} />
                    <span className={`font-serif text-base ${n.gold ? 'text-prosperus-gold-light' : 'text-white'}`}>{NIVEL_LABEL[n.key]}</span>
                  </span>
                  {n.sub && <span className="text-[10px] text-white/40 font-sans">{n.sub}</span>}
                </div>
                <Entrada value={nv.nome || ''} onChange={(e) => setNivel(n.key, 'nome', e.target.value)} aria-label={`${NIVEL_LABEL[n.key]}: nome`} placeholder="Nome da opção" />
                <Entrada value={nv.valor || ''} onChange={(e) => setNivel(n.key, 'valor', e.target.value)} aria-label={`${NIVEL_LABEL[n.key]}: valor`} prefixo="R$" inputMode="decimal" placeholder="0" className={n.gold ? 'font-serif !text-lg' : ''} />
                <TotalAnual valor={nv.valor} textos={[nv.nome, nv.muda]} testId={`escada-editor-${n.key}-ano`} />
                <Area value={nv.muda || ''} onChange={(e) => setNivel(n.key, 'muda', e.target.value)} rows={2} aria-label={`${NIVEL_LABEL[n.key]}: o que muda`} placeholder="O que muda nesta opção" />
              </Painel>
            </div>
          );
        })}
      </div>
      <Campo label="Condição de entrada" hint="O que precisa acontecer para ele entrar: sinal, primeira parcela, piloto.">
        <Entrada value={value.condicao || ''} onChange={(e) => set('condicao', e.target.value)} aria-label="Condição de entrada" placeholder="Ex.: 30% no ato e o restante em 6x" />
      </Campo>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

/** checklist_condicoes: checkboxes com entrada de detalhe (à vista, parcelado, contrato, contrapartida, garantia). */
const CONDICOES: { key: string; label: string; detail: string; placeholder: string; sufixo?: string; numeric?: boolean }[] = [
  { key: 'avista', label: 'À vista', detail: 'desconto', placeholder: 'Desconto? Ex.: 10%' },
  { key: 'parcelado', label: 'Parcelado', detail: 'vezes', placeholder: 'N', sufixo: 'x', numeric: true },
  { key: 'contrato', label: 'Contrato', detail: 'meses', placeholder: 'N', sufixo: 'meses', numeric: true },
  { key: 'contrapartida', label: 'Contrapartida para desconto', detail: 'texto', placeholder: 'O que pede em troca' },
  { key: 'garantia', label: 'Garantia', detail: 'texto', placeholder: 'Qual garantia' },
];
/** Mesa de negociação: cada condição é uma carta; o toque vira a carta (marca) e o detalhe entra nela. */
export const ChecklistCondicoesWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="mesa-condicoes-editor">
        {CONDICOES.map((c) => {
          const item = value[c.key] || { ativo: false };
          const on = !!item.ativo;
          return (
            <div key={c.key} data-testid={`condicao-editor-${c.key}`} data-selected={on ? 'true' : 'false'} className={`rounded-lg border p-2 sm:p-3 space-y-2 transition ${on ? 'border-prosperus-gold-dark/50 bg-prosperus-gold-dark/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <label className={`${TAP} flex items-center gap-3 cursor-pointer`}>
                <span className="relative inline-flex items-center justify-center w-6 h-6 shrink-0">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onChange({ ...value, [c.key]: { ...item, ativo: e.target.checked } })}
                    className="peer absolute inset-0 w-6 h-6 opacity-0 cursor-pointer"
                    aria-label={c.label}
                  />
                  <span aria-hidden="true" className={`w-6 h-6 rounded-md border flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-prosperus-gold-dark/60 ${on ? 'bg-prosperus-gold-dark border-prosperus-gold-dark text-black' : 'border-white/30 text-transparent'}`}><IconeCheck /></span>
                </span>
                <span className={`text-sm font-sans ${on ? 'text-white font-semibold' : 'text-white/70'}`}>{c.label}</span>
              </label>
              <div className="flex items-center gap-2">
                <Entrada
                  value={item[c.detail] || ''}
                  onChange={(e) => onChange({ ...value, [c.key]: { ...item, ativo: true, [c.detail]: e.target.value } })}
                  aria-label={`${c.label}: detalhe`}
                  placeholder={c.placeholder}
                  inputMode={c.numeric ? 'numeric' : undefined}
                  className={c.numeric ? 'sm:w-28' : ''}
                  disabled={!on}
                />
                {c.sufixo && <span className="text-sm text-white/50 font-sans">{c.sufixo}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

type Caso = { nome: string; antes: string; depois: string; citar: string };

/** casos: cartões de prova num carrossel (desliza no celular): nome ou perfil · antes · depois · pode citar? */
export const CasosWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const max: number = template.max || 6;
  const cs = lista<Caso>(value.casos);
  const rows: Caso[] = cs.length ? cs : [{ nome: '', antes: '', depois: '', citar: '' }];
  const update = (next: Caso[]) => onChange({ casos: next });
  const set = (i: number, k: keyof Caso, v: string) => { const next = rows.map((c) => ({ ...c })); next[i][k] = v; update(next); };
  const cartas = rows.map((c, i) => (
    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2 h-full" data-testid={`caso-editor-${i}`}>
      <div className="flex items-center justify-between gap-2">
        <Rotulo>Caso {i + 1}</Rotulo>
        <BotaoIcone onClick={() => update(rows.filter((_, k) => k !== i))} label={`Remover caso ${i + 1}`} disabled={rows.length <= 1} className="!min-h-[36px] !min-w-[36px] -mr-1"><IconeX /></BotaoIcone>
      </div>
      <Entrada value={c.nome || ''} onChange={(e) => set(i, 'nome', e.target.value)} aria-label={`${campo.nome}: nome ou perfil do caso ${i + 1}`} placeholder="Nome ou perfil (ex.: dono de clínica em Curitiba)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Campo label="Antes"><Area value={c.antes || ''} onChange={(e) => set(i, 'antes', e.target.value)} rows={2} aria-label={`Caso ${i + 1}: antes`} placeholder="Como estava" /></Campo>
        <Campo label="Depois"><Area value={c.depois || ''} onChange={(e) => set(i, 'depois', e.target.value)} rows={2} aria-label={`Caso ${i + 1}: depois`} placeholder="Como ficou" /></Campo>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Rotulo className="mr-1">Pode citar?</Rotulo>
        <div role="radiogroup" aria-label={`Caso ${i + 1}: pode citar`} className="grid grid-cols-2 gap-2 w-full sm:w-56">
          <CartaoOpcao selected={c.citar === 'sim'} onClick={() => set(i, 'citar', 'sim')} title="Sim" />
          <CartaoOpcao selected={c.citar === 'nao'} onClick={() => set(i, 'citar', 'nao')} title="Não" />
        </div>
      </div>
    </div>
  ));
  return (
    <div className="space-y-3">
      <Carrossel itens={cartas} label={`${campo.nome}: casos`} nomeItem="caso" testId="carrossel-casos" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((c) => (c.nome || '').trim()).length} max={max} unidade="casos" />
        {rows.length < max && <BotaoAdd onClick={() => update([...rows, { nome: '', antes: '', depois: '', citar: '' }])}>+ Caso</BotaoAdd>}
      </div>
    </div>
  );
};
