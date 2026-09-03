import React, { useEffect, useState } from 'react';
import { CANAIS, QUEM_VENDE, lacunaKeys, norm } from './estrutura';
import { Area, Campo, CartaoOpcao, Chip, Dica, Entrada, Lacuna, Observacao, Painel, Rotulo, Slider, Stepper, lista, type WidgetProps } from './ui';
import { CORTES_ICP, ICONE_CANAL } from './display';
import { IconeAspas, IconeDegraus } from '../contexto/icones';

/**
 * escolha: chips com a(s) opcao(oes) sugerida(s) + "Outra"; ou cartas (template.estilo = 'cartas' | 'radio')
 * com descricao curta (template.descricoes[opcao], ou a fonte da sugestao) e glifo (template.icones = 'degraus').
 */
export const EscolhaWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange, ctx }) => {
  const opcoes = (ctx.opcoes || []).filter(Boolean);
  const cartas = template.estilo === 'cartas' || template.estilo === 'radio';
  const comOutra = template.outra !== false;
  const isOutra = value.opcao === 'Outra';
  const label = `Editar ${campo.nome}`;
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  const fonteDe = (o: string) => {
    if (descricoes[o]) return descricoes[o];
    if (o === (campo.sugerido || '').trim() && campo.fonte) return `Fonte: ${campo.fonte}`;
    const alt = (campo.alternativas || []).find((a) => a.sugerido.trim() === o);
    return alt?.fonte ? `Fonte: ${alt.fonte}` : undefined;
  };
  const glifo = (i: number) => (template.icones === 'degraus' ? <IconeDegraus n={(Math.min(3, i + 1)) as 1 | 2 | 3} className="w-6 h-6" /> : undefined);

  return (
    <div className="space-y-2">
      {cartas ? (
        <div role="radiogroup" aria-label={campo.nome} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {opcoes.map((o, i) => <CartaoOpcao key={o} selected={value.opcao === o} onClick={() => onChange({ opcao: o, texto: '' })} title={o} sub={fonteDe(o)} icone={glifo(i)} />)}
          {comOutra && <CartaoOpcao selected={isOutra} onClick={() => onChange({ opcao: 'Outra', texto: value.texto || '' })} title="Outra" sub="Escreva o nome" />}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => <Chip key={o} selected={value.opcao === o} onClick={() => onChange({ opcao: o, texto: '' })}>{o}</Chip>)}
          {comOutra && <Chip selected={isOutra} onClick={() => onChange({ opcao: 'Outra', texto: value.texto || '' })}>Outra</Chip>}
        </div>
      )}
      {(isOutra || (opcoes.length === 0 && comOutra)) && (
        <Entrada
          value={value.texto || ''}
          onChange={(e) => onChange({ opcao: 'Outra', texto: e.target.value })}
          aria-label={label}
          placeholder={template.placeholder || 'Escreva a opção'}
        />
      )}
      {template.dica && <Dica>{template.dica}</Dica>}
    </div>
  );
};

/** frase: 1 input com a frase modelo embaixo e contador (template.max); estilo 'citacao' (2.4) abre as aspas em cima. */
export const FraseWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const max: number | undefined = typeof template.max === 'number' ? template.max : undefined;
  const frase: string = value.frase || '';
  const passou = typeof max === 'number' && frase.length > max;
  const citacao = template.estilo === 'citacao';
  return (
    <div className={`space-y-1.5 ${citacao ? 'rounded-lg border border-prosperus-gold-dark/40 bg-white/[0.03] p-3 sm:p-4' : ''}`} data-testid={citacao ? 'citacao-editor' : undefined}>
      {citacao && <span className="block text-prosperus-gold-dark" aria-hidden="true"><IconeAspas className="w-6 h-6" /></span>}
      <Entrada
        value={frase}
        onChange={(e) => onChange({ frase: e.target.value })}
        aria-label={`Editar ${campo.nome}`}
        placeholder={template.modelo || 'Escreva em uma frase'}
        maxLength={max ? max + 50 : undefined}
        className={citacao ? 'font-serif !text-lg' : ''}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {template.modelo && <span className="text-[11px] text-white/40 font-sans italic">Modelo: {template.modelo}</span>}
        {typeof max === 'number' && (
          <span className={`text-[11px] font-sans ${passou ? 'text-red-400' : 'text-white/40'}`}>{frase.length} de {max}</span>
        )}
      </div>
    </div>
  );
};

/**
 * lacunas: a frase-modelo em serifa com as lacunas para tocar e completar ("Eu sou __, ajudo __ a __").
 * Lacuna com chips (template.lacunas[].chips) ganha os chips embaixo. "Escrever de outro jeito" abre o texto livre.
 */
export const LacunasWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const modelo: string = typeof template.modelo === 'string' ? template.modelo : '';
  const defs = lista<{ key: string; rotulo?: string; placeholder?: string; chips?: string[] }>(template.lacunas);
  const keys = lacunaKeys(modelo);
  const lac: Record<string, string> = value.lacunas && typeof value.lacunas === 'object' ? value.lacunas : {};
  const livre: string = value.livre || '';
  const [modoLivre, setModoLivre] = useState(!!livre.trim());
  useEffect(() => { if (livre.trim()) setModoLivre(true); }, [livre]);
  const max: number | undefined = typeof template.max === 'number' ? template.max : undefined;

  const defDe = (k: string) => defs.find((d) => d.key === k) || { key: k };
  const setLac = (k: string, v: string) => onChange({ ...value, lacunas: { ...lac, [k]: v }, livre: '' });
  const composta = modelo.replace(/\[(\w+)\]/g, (_, k) => (lac[k] || '').trim()).replace(/\s{2,}/g, ' ').trim();

  if (modoLivre) {
    return (
      <div className="space-y-1.5" data-testid={`lacunas-livre-${campo.key}`}>
        <Entrada
          value={livre}
          onChange={(e) => onChange({ ...value, livre: e.target.value })}
          aria-label={`Editar ${campo.nome}`}
          placeholder={modelo.replace(/\[(\w+)\]/g, '…') || 'Escreva em uma frase'}
          maxLength={max ? max + 50 : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => { setModoLivre(false); onChange({ ...value, livre: '' }); }} className="text-[11px] text-white/50 hover:text-white font-sans underline-offset-2 hover:underline">
            Preencher as lacunas
          </button>
          {typeof max === 'number' && <span className={`text-[11px] font-sans ${livre.length > max ? 'text-red-400' : 'text-white/40'}`}>{livre.length} de {max}</span>}
        </div>
      </div>
    );
  }

  const partes = modelo.split(/(\[\w+\])/);
  return (
    <div className="space-y-3" data-testid={`lacunas-${campo.key}`}>
      <p className="font-serif text-lg sm:text-xl text-white leading-[2.4]">
        {partes.map((p, i) => {
          const m = p.match(/^\[(\w+)\]$/);
          if (!m) return <span key={i}>{p}</span>;
          const d = defDe(m[1]);
          return (
            <Lacuna
              key={m[1]}
              value={lac[m[1]] || ''}
              onChange={(v) => setLac(m[1], v)}
              label={`${campo.nome}: ${d.rotulo || m[1]}`}
              placeholder={d.placeholder || d.rotulo || m[1]}
            />
          );
        })}
      </p>
      {keys.map((k) => {
        const d = defDe(k);
        if (!Array.isArray(d.chips) || !d.chips.length) return null;
        return (
          <div key={k} className="flex flex-wrap items-center gap-2" role="group" aria-label={`${d.rotulo || k}: opções`}>
            {d.chips.map((c) => <Chip key={c} selected={(lac[k] || '').trim() === c} onClick={() => setLac(k, c)}>{c}</Chip>)}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => { setModoLivre(true); onChange({ ...value, livre: keys.some((x) => (lac[x] || '').trim()) ? composta : '' }); }}
          className="text-[11px] text-white/50 hover:text-white font-sans underline-offset-2 hover:underline"
        >
          Escrever de outro jeito
        </button>
        {typeof max === 'number' && <span className={`text-[11px] font-sans ${composta.length > max ? 'text-red-400' : 'text-white/40'}`}>{composta.length} de {max}</span>}
      </div>
    </div>
  );
};

/** texto / antes_depois: textarea simples (template.rotulo opcional). */
export const TextoWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => (
  <div className="space-y-1">
    {template.rotulo && <Rotulo>{template.rotulo}</Rotulo>}
    <Area
      value={value.texto || ''}
      onChange={(e) => onChange({ texto: e.target.value })}
      rows={template.rows || 4}
      aria-label={`Editar ${campo.nome}`}
      placeholder={template.placeholder || 'Escreva do seu jeito'}
    />
  </div>
);

/** meta: 3 mostradores (clientes · até quando · reuniões por semana) com mais/menos; a conta aparece na prévia. */
export const MetaWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Painel accent="muted" className="space-y-1">
          <Rotulo>Clientes</Rotulo>
          <Stepper value={value.clientes || ''} onChange={(v) => set('clientes', v)} label="Quantos clientes" min={1} max={999} />
        </Painel>
        <Painel accent="muted" className="space-y-1">
          <Rotulo>Até quando</Rotulo>
          <Entrada value={value.ate || ''} onChange={(e) => set('ate', e.target.value)} aria-label="Até quando" placeholder="mês ou data" />
        </Painel>
        <Painel accent="muted" className="space-y-1">
          <Rotulo>Reuniões de venda por semana</Rotulo>
          <Stepper value={value.reunioes || ''} onChange={(v) => set('reunioes', v)} label="Reuniões por semana" min={1} max={99} />
        </Painel>
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

const PLACEHOLDER_ICP: Record<string, string> = {
  setor: 'Ex.: clínicas de saúde',
  papel: 'Ex.: dono, diretor',
  tamanho: 'Ex.: 5 a 30 pessoas, 100 a 500 mil/mês',
  territorio: 'Ex.: Sul e Sudeste',
};

/**
 * icp: retrato em 4 cortes (setor · papel · tamanho ou bolso · território): cada célula tem a entrada e,
 * quando o template traz `chips[corte]`, os chips para escolher num toque (o toque preenche a célula;
 * escrever continua valendo). Descrição livre embaixo.
 */
export const IcpWidget: React.FC<WidgetProps> = ({ value, onChange, template }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const chipsDe = (k: string): string[] => (template.chips && typeof template.chips === 'object' && Array.isArray(template.chips[k]) ? template.chips[k] : []);
  return (
    <div className="space-y-2" data-testid="retrato-icp-editor">
      <div className="grid grid-cols-1 sm:grid-cols-2 rounded-lg border border-prosperus-gold-dark/40 bg-white/[0.03] overflow-hidden">
        {CORTES_ICP.map((c, i) => {
          const chips = chipsDe(c.key);
          const atual = norm(value[c.key] || '');
          return (
            <div key={c.key} className={`min-w-0 p-3 space-y-2 ${i % 2 === 1 ? 'sm:border-l sm:border-white/10' : ''} ${i >= 1 ? 'border-t border-white/10 sm:border-t-0' : ''} ${i >= 2 ? 'sm:border-t sm:border-white/10' : ''}`}>
              <Campo label={c.label}>
                <Entrada value={value[c.key] || ''} onChange={(e) => set(c.key, e.target.value)} aria-label={c.label} placeholder={PLACEHOLDER_ICP[c.key]} />
              </Campo>
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${c.label}: opções`}>
                  {chips.map((ch) => <Chip key={ch} selected={atual === norm(ch)} onClick={() => set(c.key, atual === norm(ch) ? '' : ch)}>{ch}</Chip>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} label="Descrição livre" />
    </div>
  );
};

/** dois_campos / dois_textos: pares rotulados (template.campos), entrada ou textarea (template.multiline). */
export const CamposRotuladosWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const campos: { key: string; label: string; placeholder?: string }[] = Array.isArray(template.campos) ? template.campos : [];
  const multi = !!template.multiline;
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className={`grid grid-cols-1 ${multi ? 'md:grid-cols-2' : 'sm:grid-cols-2'} gap-3`}>
      {campos.map((c) => (
        <Campo key={c.key} label={c.label}>
          {multi
            ? <Area value={value[c.key] || ''} onChange={(e) => set(c.key, e.target.value)} rows={4} aria-label={c.label} placeholder={c.placeholder || 'Escreva do seu jeito'} />
            : <Entrada value={value[c.key] || ''} onChange={(e) => set(c.key, e.target.value)} aria-label={c.label} placeholder={c.placeholder || ''} />}
        </Campo>
      ))}
    </div>
  );
};

/**
 * dois_numeros: entradas numericas rotuladas (template.campos: moeda | num | prazo).
 * Campo `num` com `stepper: true` vira mais/menos; com `slider: { min, max, marcas }` ganha a régua embaixo.
 */
export const DoisNumerosWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const campos: { key: string; label: string; tipo?: string; placeholder?: string; stepper?: boolean; min?: number; max?: number; slider?: { min: number; max: number; marcas?: number[] } }[] = Array.isArray(template.campos) ? template.campos : [];
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const cols = campos.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 ${cols} gap-3`}>
        {campos.map((c) => (
          c.stepper ? (
            <div key={c.key} className="block space-y-1">
              <Rotulo>{c.label}</Rotulo>
              <div><Stepper value={value[c.key] || ''} onChange={(v) => set(c.key, v)} label={c.label} min={c.min ?? 0} max={c.max ?? 999} /></div>
            </div>
          ) : (
            <Campo key={c.key} label={c.label}>
              <Entrada
                value={value[c.key] || ''}
                onChange={(e) => set(c.key, e.target.value)}
                aria-label={c.label}
                prefixo={c.tipo === 'moeda' ? 'R$' : undefined}
                inputMode={c.tipo === 'moeda' ? 'decimal' : c.tipo === 'num' ? 'numeric' : undefined}
                placeholder={c.placeholder || (c.tipo === 'moeda' ? '0' : c.tipo === 'num' ? 'N' : 'Ex.: 6 meses')}
              />
            </Campo>
          )
        ))}
      </div>
      {campos.filter((c) => c.slider).map((c) => {
        const s = c.slider!;
        const n = parseInt(value[c.key] || '', 10);
        return (
          <div key={`${c.key}-regua`} className="space-y-1">
            <Rotulo>{c.label}: arraste na régua</Rotulo>
            <Slider value={Number.isNaN(n) ? null : n} min={s.min} max={s.max} marcas={s.marcas} onChange={(v) => set(c.key, String(v))} label={`${c.label} (régua)`} />
          </div>
        );
      })}
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

const DURACAO_PADRAO = { min: 15, max: 120, marcas: [15, 30, 45, 60, 90, 120] };

/** canal: cartas (presencial / vídeo / ligação / misto) + régua de duração (15 a 120 min) + "1 reunião / 2 ou mais". */
export const CanalWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  const d = { ...DURACAO_PADRAO, ...(template.duracao && typeof template.duracao === 'object' ? template.duracao : {}) };
  const dur = parseInt(value.duracao || '', 10);
  const reu = parseInt(value.reunioes || '', 10);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Canal" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {CANAIS.map((c) => <CartaoOpcao key={c.id} selected={value.canal === c.id} onClick={() => set('canal', c.id)} title={c.label} sub={descricoes[c.id]} icone={ICONE_CANAL[c.id]} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Painel accent="muted" className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Rotulo>Duração</Rotulo>
            <span className="inline-flex items-center gap-1 text-sm text-white/70 font-sans">
              <Entrada inputMode="numeric" value={value.duracao || ''} onChange={(e) => set('duracao', e.target.value)} aria-label="Duração em minutos" placeholder="60" className="!w-20 text-center" />
              min
            </span>
          </div>
          <Slider value={Number.isNaN(dur) ? null : dur} min={d.min} max={d.max} step={5} marcas={d.marcas} onChange={(v) => set('duracao', String(v))} label="Duração (arraste)" sufixo=" min" />
        </Painel>
        <Painel accent="muted" className="space-y-2">
          <Rotulo>Quantas reuniões até o sim</Rotulo>
          <div role="radiogroup" aria-label="Reuniões" className="grid grid-cols-2 gap-2">
            <CartaoOpcao selected={reu === 1} onClick={() => set('reunioes', '1')} title="1 reunião" sub="fecha na mesma conversa" />
            <CartaoOpcao selected={reu >= 2} onClick={() => set('reunioes', reu >= 2 ? String(reu) : '2')} title="2 ou mais" sub="volta para fechar" />
          </div>
          <div className="flex items-center gap-2">
            <Rotulo className="!inline">Nº</Rotulo>
            <Entrada inputMode="numeric" value={value.reunioes || ''} onChange={(e) => set('reunioes', e.target.value)} aria-label="Número de reuniões" placeholder="1" className="!w-20 text-center" />
          </div>
        </Painel>
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

/**
 * quem_vende: quem conduz a reunião de venda (radio cards; define a voz do script), o nome de quem vende
 * (opcional) e de onde vem o lead.
 */
export const QuemVendeWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const descricoes: Record<string, string> = template.descricoes && typeof template.descricoes === 'object' ? template.descricoes : {};
  return (
    <div className="space-y-4" data-testid="quem-vende">
      <div className="space-y-1.5">
        <Rotulo>Quem conduz a reunião de venda</Rotulo>
        <div role="radiogroup" aria-label="Quem conduz a reunião de venda" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUEM_VENDE.map((q) => (
            <CartaoOpcao key={q.id} selected={value.quem === q.id} onClick={() => set('quem', q.id)} title={q.label} sub={descricoes[q.id]} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Rotulo>Nome de quem vende (opcional)</Rotulo>
          <Entrada value={value.nome || ''} onChange={(e) => set('nome', e.target.value)} aria-label="Nome de quem vende" placeholder={template.placeholderNome || 'Ex.: Paloma'} />
        </div>
        <div className="space-y-1">
          <Rotulo>De onde vem o lead</Rotulo>
          <Entrada value={value.origem_lead || ''} onChange={(e) => set('origem_lead', e.target.value)} aria-label="De onde vem o lead" placeholder={template.placeholderLead || 'indicação, Instagram, evento'} />
        </div>
      </div>
      {template.dica && <Dica>{template.dica}</Dica>}
    </div>
  );
};
