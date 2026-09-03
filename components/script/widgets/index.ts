/**
 * Registro dos widgets da Ficha do Script.
 * `widget` e `template` vem de data/script-ficha-fields.json (por campo). Campo sem widget
 * conhecido cai no textarea simples do FichaField.
 */
import type React from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import {
  ESTRUTURA, isWidgetType, pilarNames,
  type Estrutura, type ParseContext, type ParseResult, type WidgetTemplate, type WidgetType,
} from './estrutura';
import type { WidgetProps } from './ui';
import { textoVazio } from './vazio';
import { CamposRotuladosWidget, CanalWidget, DoisNumerosWidget, EscolhaWidget, FraseWidget, IcpWidget, MetaWidget, TextoWidget } from './SimpleWidgets';
import { ChipsTextoWidget, CitacoesWidget, EscolhaDeListaWidget, ListaNumeradaWidget, TabelaWidget } from './ListWidgets';
import { CasosWidget, ChecklistCondicoesWidget, EscadaWidget, HistoriaPodioWidget, PilaresWidget, VsWidget } from './StructuredWidgets';

export type { Estrutura, ParseContext, ParseResult, WidgetTemplate, WidgetType, WidgetProps };
export { ESTRUTURA, isWidgetType, parseEstrutura, renderEstrutura, vaziaEstrutura } from './estrutura';
export { DISPLAYS, TextoBruto, type DisplayProps } from './display';

export const WIDGETS: Record<WidgetType, React.FC<WidgetProps>> = {
  escolha: EscolhaWidget,
  meta: MetaWidget,
  frase: FraseWidget,
  texto: TextoWidget,
  antes_depois: TextoWidget,
  historia_podio: HistoriaPodioWidget,
  vs: VsWidget,
  icp: IcpWidget,
  chips_texto: ChipsTextoWidget,
  citacoes: CitacoesWidget,
  lista_numerada: ListaNumeradaWidget,
  tabela: TabelaWidget,
  pilares: PilaresWidget,
  escolha_de_lista: EscolhaDeListaWidget,
  escada: EscadaWidget,
  checklist_condicoes: ChecklistCondicoesWidget,
  dois_numeros: DoisNumerosWidget,
  dois_campos: CamposRotuladosWidget,
  dois_textos: CamposRotuladosWidget,
  canal: CanalWidget,
  casos: CasosWidget,
};

export interface ResolvedWidget {
  type: WidgetType;
  template: WidgetTemplate;
  Component: React.FC<WidgetProps>;
  parse: (text: string, ctx: ParseContext) => ParseResult;
  render: (e: Estrutura) => string;
  vazio: (ctx: ParseContext) => Estrutura;
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
  };
}

/** Texto que vale hoje para um campo (efetivo > valor > sugerido). */
function textoAtual(c?: ScriptFieldView | null): string {
  if (!c) return '';
  return c.valor_efetivo || c.valor || c.sugerido || '';
}

/**
 * Contexto do parse/render: opcoes de escolha (sugerido + alternativas + template.opcoes + opcoes do campo)
 * e nomes dos pilares do 4.2 (para 4.3 e 4.4).
 */
export function buildContext(campo: ScriptFieldView, todos?: Record<string, ScriptFieldView>): ParseContext {
  const template: WidgetTemplate = campo.template && typeof campo.template === 'object' ? campo.template : {};
  const opcoes: string[] = [];
  // Marcador ("a definir" etc.) nunca vira opção de escolha
  const add = (o?: string | null) => { const v = (o || '').trim(); if (v && !textoVazio(v) && !opcoes.includes(v)) opcoes.push(v); };
  if (Array.isArray(campo.opcoes)) campo.opcoes.forEach(add);
  if (Array.isArray(template.opcoes)) template.opcoes.forEach(add);
  if (campo.widget === 'escolha' && template.estilo !== 'radio') {
    add(campo.sugerido);
    (campo.alternativas || []).forEach((a) => add(a.sugerido));
  }
  const origem: string = template.origem || template.prefill || '';
  let pilares: string[] = [];
  if (origem && todos && todos[origem]) {
    const src = todos[origem];
    pilares = pilarNames(src.estrutura || null, textoAtual(src));
  }
  return { opcoes, pilares };
}
