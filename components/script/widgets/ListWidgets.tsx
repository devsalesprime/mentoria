import React, { useState } from 'react';
import { Area, BotaoAdd, BotaoIcone, Campo, Chip, Contador, Dica, DicaTeclado, Entrada, Numero, Rotulo, lista, move, teclasLista, type WidgetProps } from './ui';
import { COPY_USO_RESPOSTA, COPY_VOZ_CLIENTE } from './display';
import { IconeSeta, IconeX } from '../contexto/icones';

/** chips_texto: chips fixos (template.chips) + texto livre. */
export const ChipsTextoWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const all: string[] = Array.isArray(template.chips) ? template.chips : [];
  const chips = lista<string>(value.chips);
  const toggle = (c: string) => onChange({ ...value, chips: chips.includes(c) ? chips.filter((x) => x !== c) : [...chips, c] });
  return (
    <div className="space-y-2">
      {all.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {all.map((c) => <Chip key={c} selected={chips.includes(c)} onClick={() => toggle(c)}>{c}</Chip>)}
        </div>
      )}
      <Area
        value={value.texto || ''}
        onChange={(e) => onChange({ ...value, texto: e.target.value })}
        rows={3}
        aria-label={`Editar ${campo.nome}`}
        placeholder={template.placeholder || 'Complete com as suas palavras'}
      />
    </div>
  );
};

/** escolha_de_lista: escolhe entre os itens do 4.2 (ctx.pilares) + texto de fallback. */
export const EscolhaDeListaWidget: React.FC<WidgetProps> = ({ campo, value, onChange, ctx }) => {
  const opcoes = (ctx.pilares || []).filter(Boolean);
  return (
    <div className="space-y-2">
      {opcoes.length > 0 ? (
        <div role="radiogroup" aria-label={campo.nome} className="flex flex-wrap gap-2">
          {opcoes.map((o) => <Chip key={o} role="radio" selected={value.escolhido === o} onClick={() => onChange({ escolhido: o, texto: '' })}>{o}</Chip>)}
        </div>
      ) : (
        <Dica>Preencha os pilares no 4.2 para escolher da lista, ou escreva abaixo.</Dica>
      )}
      <Entrada
        value={value.texto || ''}
        onChange={(e) => onChange({ escolhido: '', texto: e.target.value })}
        aria-label={`Editar ${campo.nome}`}
        placeholder={opcoes.length ? 'Ou escreva outro' : 'Qual pilar resolve a dor principal?'}
      />
    </div>
  );
};

/**
 * citacoes: cartões de citação com aspas grandes, as palavras do cliente em serifa; sobe, desce e remove.
 * template.min / max; template.filete = 'ouro' põe o filete dourado (3.4, o desejo).
 */
export const CitacoesWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const min: number = template.min || 3;
  const max: number = template.max || 5;
  const filete = template.filete === 'ouro';
  const itens = lista<string>(value.citacoes);
  const rows = itens.length < min ? [...itens, ...Array(min - itens.length).fill('')] : itens;
  const update = (next: string[]) => onChange({ citacoes: next });
  const set = (i: number, v: string) => { const next = rows.slice(); next[i] = v; update(next); };
  const remove = (i: number) => update(rows.filter((_, k) => k !== i));
  return (
    <div className="space-y-2">
      {rows.map((c, i) => (
        <div
          key={i}
          data-testid="citacao-carta"
          className={`rounded-lg border bg-white/[0.03] p-3 flex gap-2 items-start ${filete ? 'border-white/10 border-l-2 border-l-prosperus-gold-dark' : 'border-white/10'}`}
        >
          <span className="font-serif text-3xl text-prosperus-gold-dark/70 leading-none select-none -mt-1" aria-hidden="true">“</span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <Area
              value={c}
              onChange={(e) => set(i, e.target.value)}
              rows={2}
              aria-label={`${campo.nome}: frase ${i + 1}`}
              placeholder="Do jeito que ele fala"
              className="!bg-transparent !border-0 !px-0 !py-1 !min-h-0 font-serif italic !text-base !leading-snug"
            />
            <span className="block text-[10px] uppercase tracking-widest text-white/40 font-sans">{template.voz || COPY_VOZ_CLIENTE}</span>
          </div>
          <div className="flex flex-col gap-0.5 -mr-1">
            <BotaoIcone onClick={() => update(move(rows, i, i - 1))} label={`Subir frase ${i + 1}`} disabled={i === 0} className="!min-h-[36px] !min-w-[36px]"><IconeSeta direcao="cima" /></BotaoIcone>
            <BotaoIcone onClick={() => update(move(rows, i, i + 1))} label={`Descer frase ${i + 1}`} disabled={i === rows.length - 1} className="!min-h-[36px] !min-w-[36px]"><IconeSeta direcao="baixo" /></BotaoIcone>
            <BotaoIcone onClick={() => remove(i)} label={`Remover frase ${i + 1}`} disabled={rows.length <= 1} className="!min-h-[36px] !min-w-[36px]"><IconeX /></BotaoIcone>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((c) => c.trim()).length} min={min} max={max} unidade="frases" />
        {rows.length < max && <BotaoAdd onClick={() => update([...rows, ''])}>+ Frase</BotaoAdd>}
      </div>
      <Dica>Do jeito que ele fala: grave na barra de contexto ou escreva.</Dica>
    </div>
  );
};

/**
 * lista_numerada: lista de bolso (template.min / max) com as setas de ordem e, por item, a linha
 * "o que faço com a resposta" (abre num toque; some quando vazia).
 */
export const ListaNumeradaWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const min: number = template.min || 1;
  const max: number = template.max || 10;
  const itens = lista<string>(value.itens);
  const usosBase = lista<string>(value.usos);
  const rows = itens.length < min ? [...itens, ...Array(min - itens.length).fill('')] : itens;
  const usos = rows.map((_, i) => usosBase[i] || '');
  const [abertos, setAbertos] = useState<Record<number, boolean>>({});
  const update = (nextItens: string[], nextUsos: string[]) => onChange({ ...value, itens: nextItens, usos: nextUsos });
  const set = (i: number, v: string) => { const next = rows.slice(); next[i] = v; update(next, usos); };
  const setUso = (i: number, v: string) => { const next = usos.slice(); next[i] = v; update(rows, next); };
  const remove = (i: number) => { update(rows.filter((_, k) => k !== i), usos.filter((_, k) => k !== i)); setAbertos({}); };
  const mover = (de: number, para: number) => { if (para < 0 || para >= rows.length) return; update(move(rows, de, para), move(usos, de, para)); setAbertos({}); };
  return (
    <div className="space-y-2" data-lista data-testid="lista-bolso">
      {rows.map((it, i) => {
        const usoAberto = !!abertos[i] || !!usos[i].trim();
        return (
          <div key={i} data-item={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Numero n={i + 1} />
              <Entrada
                value={it}
                onChange={(e) => set(i, e.target.value)}
                onKeyDown={teclasLista({ i, total: rows.length, onMover: mover, onAdd: rows.length < max ? () => update([...rows, ''], [...usos, '']) : undefined })}
                aria-label={`${campo.nome}: item ${i + 1}`}
                placeholder={template.placeholder || 'O que você precisa saber'}
              />
              <div className="flex flex-col sm:flex-row gap-0.5 shrink-0">
                <BotaoIcone onClick={() => mover(i, i - 1)} label={`Subir item ${i + 1}`} disabled={i === 0} className="!min-w-[40px] !min-h-[40px]"><IconeSeta direcao="cima" /></BotaoIcone>
                <BotaoIcone onClick={() => mover(i, i + 1)} label={`Descer item ${i + 1}`} disabled={i === rows.length - 1} className="!min-w-[40px] !min-h-[40px]"><IconeSeta direcao="baixo" /></BotaoIcone>
                <BotaoIcone onClick={() => remove(i)} label={`Remover item ${i + 1}`} disabled={rows.length <= 1} className="!min-w-[40px] !min-h-[40px]"><IconeX /></BotaoIcone>
              </div>
            </div>
            {usoAberto ? (
              <div className="pl-9">
                <Entrada
                  value={usos[i]}
                  onChange={(e) => setUso(i, e.target.value)}
                  aria-label={`${campo.nome}: ${COPY_USO_RESPOSTA} ${i + 1}`}
                  placeholder="Ex.: dimensionar a proposta"
                  className="!min-h-[40px] !text-xs"
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAbertos((a) => ({ ...a, [i]: true }))} className="ml-9 text-[11px] text-white/40 hover:text-prosperus-gold-light font-sans underline-offset-2 hover:underline">
                + {COPY_USO_RESPOSTA}
              </button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((c) => c.trim()).length} min={min} max={max} unidade="itens" />
        <DicaTeclado />
        {rows.length < max && <BotaoAdd onClick={() => update([...rows, ''], [...usos, ''])}>+ Item</BotaoAdd>}
      </div>
    </div>
  );
};

/** tabela: linhas com as colunas do template (coluna `moeda` ganha prefixo R$). */
export const TabelaWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const cols: { key: string; label: string; tipo?: string; placeholder?: string }[] = Array.isArray(template.colunas) ? template.colunas : [];
  const linhas = lista<Record<string, string>>(value.linhas);
  const rows = linhas.length ? linhas : [Object.fromEntries(cols.map((c) => [c.key, '']))];
  const max: number = template.max || 12;
  const set = (i: number, k: string, v: string) => { const next = rows.map((r) => ({ ...r })); next[i][k] = v; onChange({ linhas: next }); };
  const remove = (i: number) => onChange({ linhas: rows.filter((_, k) => k !== i) });
  const gridCols = cols.length === 2 ? 'sm:grid-cols-[1fr_1fr_44px]' : cols.length === 3 ? 'sm:grid-cols-[1.2fr_1fr_1fr_44px]' : 'sm:grid-cols-[1fr_44px]';
  return (
    <div className="space-y-2">
      <div className={`hidden sm:grid ${gridCols} gap-2 px-1`}>
        {cols.map((c) => <Rotulo key={c.key}>{c.label}</Rotulo>)}
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-1 ${gridCols} gap-2 items-center rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-0 sm:border-0 sm:bg-transparent`}>
          {cols.map((c) => (
            <Campo key={c.key} label={c.label} className="sm:[&>span]:hidden">
              <Entrada
                value={r[c.key] || ''}
                onChange={(e) => set(i, c.key, e.target.value)}
                aria-label={`${campo.nome}: linha ${i + 1}, ${c.label}`}
                prefixo={c.tipo === 'moeda' ? 'R$' : undefined}
                inputMode={c.tipo === 'moeda' ? 'decimal' : undefined}
                placeholder={c.placeholder || ''}
              />
            </Campo>
          ))}
          <BotaoIcone onClick={() => remove(i)} label={`Remover linha ${i + 1}`} disabled={rows.length <= 1} className="justify-self-end sm:justify-self-auto"><IconeX /></BotaoIcone>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Contador n={rows.filter((r) => Object.values(r).some((v) => (v || '').trim())).length} max={max} unidade="linhas" />
        {rows.length < max && <BotaoAdd onClick={() => onChange({ linhas: [...rows, Object.fromEntries(cols.map((c) => [c.key, '']))] })}>+ Linha</BotaoAdd>}
      </div>
      {template.dica && <Dica>{template.dica}</Dica>}
    </div>
  );
};
