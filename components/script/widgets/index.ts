/**
 * Registro dos widgets da Ficha do Script.
 * `widget` e `template` vem de data/script-ficha-fields.json (por campo). Campo sem widget
 * conhecido cai no textarea simples do FichaField.
 */
import type React from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import {
  ESTRUTURA, isWidgetType, pilarNames, splitLines, stripQuotes,
  type Estrutura, type ParseContext, type ParseResult, type WidgetTemplate, type WidgetType,
} from './estrutura';
import type { DisplayProps, WidgetProps } from './ui';
import { textoLimpo, textoVazio } from './vazio';
import { CamposRotuladosWidget, CanalWidget, DoisNumerosWidget, EscolhaWidget, FraseWidget, IcpWidget, LacunasWidget, QuemVendeWidget, TextoWidget } from './SimpleWidgets';
import { ChipsTextoWidget, CitacoesWidget, ListaNumeradaWidget, TabelaWidget } from './ListWidgets';
import { CasosWidget, ChecklistCondicoesWidget, EscadaWidget, PilaresWidget } from './StructuredWidgets';
import { BaralhoWidget } from './BaralhoWidget';
import { PrateleiraWidget } from './Prateleira';
import { ChaveFechaduraWidget } from './ChaveFechadura';
import { DoisCaminhosWidget } from './DoisCaminhos';
import { CapaLivroWidget } from './CapaLivro';
import { RetornoWidget } from './Retorno';
import { RadarWidget } from './Radar';
import { MostradorWidget } from './Mostrador';
import { DorPilarWidget } from './DorPilar';
import { BalancaWidget } from './Balanca';
import { LinhaTempoWidget } from './LinhaTempo';
import { JanelaAnoWidget } from './JanelaAno';

export type { Estrutura, ParseContext, ParseResult, WidgetTemplate, WidgetType, WidgetProps, DisplayProps };
export { ESTRUTURA, isWidgetType, parseEstrutura, renderEstrutura, vaziaEstrutura, lacunaKeys } from './estrutura';
export { DISPLAYS, TextoBruto } from './display';

export const WIDGETS: Record<WidgetType, React.FC<WidgetProps>> = {
  escolha: EscolhaWidget,
  meta: MostradorWidget,
  frase: FraseWidget,
  lacunas: LacunasWidget,
  texto: TextoWidget,
  antes_depois: JanelaAnoWidget,
  historia_podio: LinhaTempoWidget,
  vs: BalancaWidget,
  icp: IcpWidget,
  chips_texto: ChipsTextoWidget,
  citacoes: CitacoesWidget,
  lista_numerada: ListaNumeradaWidget,
  tabela: TabelaWidget,
  baralho: BaralhoWidget,
  pilares: PilaresWidget,
  escolha_de_lista: DorPilarWidget,
  escada: EscadaWidget,
  checklist_condicoes: ChecklistCondicoesWidget,
  dois_numeros: DoisNumerosWidget,
  dois_campos: CamposRotuladosWidget,
  dois_textos: CamposRotuladosWidget,
  canal: CanalWidget,
  casos: CasosWidget,
  quem_vende: QuemVendeWidget,
  prateleira: PrateleiraWidget,
  chave_fechadura: ChaveFechaduraWidget,
  retorno: RetornoWidget,
  radar: RadarWidget,
  dois_caminhos: DoisCaminhosWidget,
  capa_livro: CapaLivroWidget,
};

export interface ResolvedWidget {
  type: WidgetType;
  template: WidgetTemplate;
  Component: React.FC<WidgetProps>;
  parse: (text: string, ctx: ParseContext) => ParseResult;
  render: (e: Estrutura) => string;
  vazio: (ctx: ParseContext) => Estrutura;
  /** Pode salvar? Padrão: render não vazio. Lacunas exigem todas preenchidas (ou texto livre). */
  valido: (e: Estrutura) => boolean;
}

/** Widget do campo (ou null: usa o textarea simples). */
export function resolveWidget(campo: Pick<ScriptFieldView, 'widget' | 'template'>): ResolvedWidget | null {
  const w = campo.widget;
  if (!isWidgetType(w)) return null;
  const template: WidgetTemplate = campo.template && typeof campo.template === 'object' ? campo.template : {};
  const spec = ESTRUTURA[w];
  return {
    type: w,
    template,
    Component: WIDGETS[w],
    parse: (text, ctx) => spec.parse(text || '', template, ctx || {}),
    render: (e) => spec.render(e || {}, template).trim(),
    vazio: (ctx) => spec.vazio(template, ctx || {}),
    valido: (e) => {
      const rendered = spec.render(e || {}, template).trim();
      if (!rendered) return false;
      return spec.valido ? spec.valido(e || {}, template) : true;
    },
  };
}

/** Texto que vale hoje para um campo (efetivo > valor > sugerido). */
function textoAtual(c?: ScriptFieldView | null): string {
  if (!c) return '';
  return c.valor_efetivo || c.valor || c.sugerido || '';
}

/** Estrutura que vale hoje para um campo de outro widget: a salva (editado) ou o parse do texto atual. */
function estruturaAtual(c: ScriptFieldView): Estrutura | null {
  if (c.status === 'editado' && c.estrutura && typeof c.estrutura === 'object' && !Array.isArray(c.estrutura)) return c.estrutura;
  const w = resolveWidget(c);
  const texto = textoAtual(c);
  if (!w || !textoLimpo(texto)) return null;
  return w.parse(texto, buildContext(c)).estrutura;
}

/** A dor principal (3.3): a primeira citação da estrutura ou, sem widget, a primeira linha do texto. */
export function dorPrincipal(c?: ScriptFieldView | null): string {
  if (!c) return '';
  const e = estruturaAtual(c);
  const primeira = Array.isArray(e?.citacoes) ? String(e!.citacoes[0] || '') : '';
  if (primeira.trim()) return stripQuotes(primeira);
  const l = splitLines(textoAtual(c))[0] || '';
  return textoVazio(l) ? '' : stripQuotes(l);
}

/**
 * A objeção em forma de chip: só o trecho entre aspas quando há ("O meu caso é específico…" Acolhe: …),
 * senão a primeira frase; nunca mais que ~90 caracteres.
 */
export function resumoObjecao(s: string): string {
  const t = (s || '').trim();
  const aspas = t.match(/^["“«]([^"”»]+)["”»]/);
  let r = aspas ? aspas[1].trim() : t;
  if (r.length > 90) {
    const fim = r.slice(0, 90).search(/[.!?](\s|$)/);
    r = fim > 20 ? r.slice(0, fim + 1) : `${r.slice(0, 88).trimEnd()}…`;
  }
  return r;
}

/** As objeções do 6.3 (linhas da tabela ou baralho) mais as clássicas do template dele, sem repetição. */
export function objecoesDe(c?: ScriptFieldView | null): string[] {
  if (!c) return [];
  const out: string[] = [];
  const add = (s: string) => { const v = stripQuotes(resumoObjecao(s || '')); if (v && !textoVazio(v) && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v); };
  const e = estruturaAtual(c);
  const cols: { key: string }[] = Array.isArray(c.template?.colunas) ? c.template!.colunas : [];
  const kO = cols[0]?.key || 'objecao';
  for (const r of Array.isArray(e?.linhas) ? e!.linhas : []) add(String(r?.[kO] || ''));
  for (const cl of Array.isArray(c.template?.classicas) ? c.template!.classicas : []) add(String(cl));
  return out;
}

/**
 * Contexto do parse/render: opcoes de escolha (sugerido + alternativas + template.opcoes + opcoes do campo),
 * nomes dos pilares do 4.2 (para 4.3 e 4.4), a dor principal do 3.3 (template.dor, para o 4.3) e as
 * objeções do 6.3 (template.objecoes, para o 5.7).
 */
export function buildContext(campo: ScriptFieldView, todos?: Record<string, ScriptFieldView>): ParseContext {
  const template: WidgetTemplate = campo.template && typeof campo.template === 'object' ? campo.template : {};
  const opcoes: string[] = [];
  // Marcador ("a definir" etc.) nunca vira opção de escolha
  const add = (o?: string | null) => { const v = (o || '').trim(); if (v && !textoVazio(v) && !opcoes.includes(v)) opcoes.push(v); };
  if (Array.isArray(campo.opcoes)) campo.opcoes.forEach(add);
  if (Array.isArray(template.opcoes)) template.opcoes.forEach(add);
  // Sem lista fixa de opcoes (1.1), a sugestao e as alternativas viram as cartas
  if (campo.widget === 'escolha' && !(Array.isArray(campo.opcoes) && campo.opcoes.length)) {
    add(campo.sugerido);
    (campo.alternativas || []).forEach((a) => add(a.sugerido));
  }
  const origem: string = template.origem || template.prefill || '';
  let pilares: string[] = [];
  if (origem && todos && todos[origem]) {
    const src = todos[origem];
    pilares = pilarNames(src.estrutura || null, textoAtual(src));
  }
  const ctx: ParseContext = { opcoes, pilares };
  if (typeof template.dor === 'string' && todos?.[template.dor]) ctx.dor = dorPrincipal(todos[template.dor]);
  if (typeof template.objecoes === 'string' && todos?.[template.objecoes]) ctx.objecoes = objecoesDe(todos[template.objecoes]);
  return ctx;
}
