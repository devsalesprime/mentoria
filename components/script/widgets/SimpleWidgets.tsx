import React from 'react';
import { CANAIS } from './estrutura';
import { Area, Campo, CartaoOpcao, Chip, Dica, Entrada, Observacao, Painel, Rotulo, type WidgetProps } from './ui';

/** escolha: chips com a(s) opcao(oes) sugerida(s) + "Outra"; ou cartoes radio (template.estilo = 'radio'). */
export const EscolhaWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange, ctx }) => {
  const opcoes = (ctx.opcoes || []).filter(Boolean);
  const radio = template.estilo === 'radio';
  const comOutra = template.outra !== false;
  const isOutra = value.opcao === 'Outra';
  const label = `Editar ${campo.nome}`;

  return (
    <div className="space-y-2">
      {radio ? (
        <div role="radiogroup" aria-label={campo.nome} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {opcoes.map((o) => <CartaoOpcao key={o} selected={value.opcao === o} onClick={() => onChange({ opcao: o, texto: '' })} title={o} />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => <Chip key={o} selected={value.opcao === o} onClick={() => onChange({ opcao: o, texto: '' })}>{o}</Chip>)}
          {comOutra && <Chip selected={isOutra} onClick={() => onChange({ opcao: 'Outra', texto: value.texto || '' })}>Outra</Chip>}
        </div>
      )}
      {(isOutra || (!radio && opcoes.length === 0)) && (
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

/** frase: 1 input com a frase modelo embaixo e contador (template.max). */
export const FraseWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const max: number | undefined = typeof template.max === 'number' ? template.max : undefined;
  const frase: string = value.frase || '';
  const passou = typeof max === 'number' && frase.length > max;
  return (
    <div className="space-y-1.5">
      <Entrada
        value={frase}
        onChange={(e) => onChange({ frase: e.target.value })}
        aria-label={`Editar ${campo.nome}`}
        placeholder={template.modelo || 'Escreva em uma frase'}
        maxLength={max ? max + 50 : undefined}
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

/** meta: 3 entradas numa frase: "[N] clientes até [data] · [N] reuniões por semana". */
export const MetaWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const mini = 'w-20 sm:w-24 text-center';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-white/80 font-sans">
        <Entrada className={mini} inputMode="numeric" value={value.clientes || ''} onChange={(e) => set('clientes', e.target.value)} aria-label="Quantos clientes" placeholder="N" />
        <span>clientes até</span>
        <Entrada className="w-40 sm:w-48" value={value.ate || ''} onChange={(e) => set('ate', e.target.value)} aria-label="Até quando" placeholder="mês ou data" />
        <span className="text-white/40">·</span>
        <Entrada className={mini} inputMode="numeric" value={value.reunioes || ''} onChange={(e) => set('reunioes', e.target.value)} aria-label="Reuniões por semana" placeholder="N" />
        <span>reuniões de venda por semana</span>
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

/** icp: 4 mini entradas num cartao: setor · papel · tamanho ou bolso · território (+ descrição livre). */
export const IcpWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <Painel accent="muted">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Setor"><Entrada value={value.setor || ''} onChange={(e) => set('setor', e.target.value)} aria-label="Setor" placeholder="Ex.: clínicas de saúde" /></Campo>
        <Campo label="Papel"><Entrada value={value.papel || ''} onChange={(e) => set('papel', e.target.value)} aria-label="Papel" placeholder="Ex.: dono, diretor" /></Campo>
        <Campo label="Tamanho ou bolso"><Entrada value={value.tamanho || ''} onChange={(e) => set('tamanho', e.target.value)} aria-label="Tamanho ou bolso" placeholder="Ex.: 5 a 30 pessoas, 100 a 500 mil/mês" /></Campo>
        <Campo label="Território"><Entrada value={value.territorio || ''} onChange={(e) => set('territorio', e.target.value)} aria-label="Território" placeholder="Ex.: Sul e Sudeste" /></Campo>
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} label="Descrição livre" />
    </Painel>
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

/** dois_numeros: entradas numericas rotuladas (template.campos: moeda | num | prazo). */
export const DoisNumerosWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const campos: { key: string; label: string; tipo?: string; placeholder?: string }[] = Array.isArray(template.campos) ? template.campos : [];
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {campos.map((c) => (
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
        ))}
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};

/** canal: radio (presencial / vídeo / ligação / misto) + duração (min) + nº de reuniões. */
export const CanalWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Canal" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CANAIS.map((c) => <CartaoOpcao key={c.id} selected={value.canal === c.id} onClick={() => set('canal', c.id)} title={c.label} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Duração (min)"><Entrada inputMode="numeric" value={value.duracao || ''} onChange={(e) => set('duracao', e.target.value)} aria-label="Duração em minutos" placeholder="60" /></Campo>
        <Campo label="Nº de reuniões"><Entrada inputMode="numeric" value={value.reunioes || ''} onChange={(e) => set('reunioes', e.target.value)} aria-label="Número de reuniões" placeholder="1" /></Campo>
      </div>
      <Observacao value={value.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};
