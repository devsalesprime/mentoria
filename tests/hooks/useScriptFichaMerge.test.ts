/**
 * Regra do merge do pre-preenchimento em marcos (hooks/useScriptFicha.ts mergeFichaData + campoEmEdicaoNaTela):
 * - decidido fica intacto (so recebe complemento e sinais laterais)
 * - vazio/sugerido recebe a sugestao nova e ganha nova_sugestao
 * - campo em `skip` (editor aberto / decisao pendente) nao muda
 * - editor aberto no DOM e detectado sem a tela avisar
 */
import { mergeFichaData, campoEmEdicaoNaTela, recomputeView, type ScriptFichaData } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

function campoDe(key: string, sugerido: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: def.obrigatorio,
    minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido, classe: sugerido ? 'Fato' : 'VZ', fonte: sugerido ? 'materiais' : '', alternativas: [],
    status: sugerido ? 'sugerido' : 'vazio', valor: '', estrutura: null, valor_efetivo: '', decidido: false,
    atualizado_por: null, atualizado_em: null, contexto_count: 0, refinando: false, complemento: null,
    ...extra,
  };
}

function blocoDe(numero: number, campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === numero)!;
  return {
    numero, nome: def.nome, descricao: def.descricao,
    total: campos.length, decididos: 0, obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0,
    minutos: 10, minutos_pendentes: 10, fechado: false, campos,
  };
}

function dados(blocos: ScriptBlockView[], extra: Partial<ScriptFichaData> = {}): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'pre_preenchida',
    materials_status: 'submitted',
    materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' },
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [],
    job: null,
    ...recomputeView(blocos),
    ...extra,
  } as ScriptFichaData;
}

const campo = (d: ScriptFichaData, key: string) => d.blocos.flatMap((b) => b.campos).find((c) => c.key === key)!;

describe('mergeFichaData', () => {
  const editado11 = campoDe('1.1', 'Sugestão antiga', { status: 'editado', decidido: true, valor: 'Meu texto', valor_efetivo: 'Meu texto' });

  it('decidido fica intacto; vazio e sugerido recebem a sugestão nova com nova_sugestao; job e status vêm do servidor', () => {
    const local = dados([
      blocoDe(1, [editado11, campoDe('1.2', '')]),
      blocoDe(2, [campoDe('2.1', 'Sou a Paloma.'), campoDe('2.2', 'Vinte anos')]),
    ]);
    const fresh = dados([
      blocoDe(1, [campoDe('1.1', 'Sugestão nova do worker'), campoDe('1.2', 'Chegou 1.2', { contexto_count: 2 })]),
      blocoDe(2, [campoDe('2.1', 'Sou a Paloma, nova versão.'), campoDe('2.2', 'Vinte anos', { refinando: true })]),
    ], { ficha_status: 'pre_preenchida', job: { id: 'j1', tipo: 'prefill', status: 'running', attempts: 1, progresso: { fase: 'bloco', etapa_atual: 3 }, created_at: 'x', started_at: 'y', finished_at: null } });

    const { data, alteradas } = mergeFichaData(local, fresh);
    expect(alteradas.sort()).toEqual(['1.2', '2.1']);
    // decidido: texto e status do mentor; o worker nao trouxe complemento nesta leitura
    expect(campo(data, '1.1')).toMatchObject({ status: 'editado', valor: 'Meu texto', sugerido: 'Sugestão antiga', decidido: true, complemento: null, nova_sugestao: false });
    // vazio -> sugerido novo
    expect(campo(data, '1.2')).toMatchObject({ status: 'sugerido', sugerido: 'Chegou 1.2', nova_sugestao: true, contexto_count: 2 });
    // sugerido -> sugerido novo
    expect(campo(data, '2.1')).toMatchObject({ sugerido: 'Sou a Paloma, nova versão.', nova_sugestao: true });
    // igual: sem etiqueta, mas o sinal lateral (refinando) atualiza
    expect(campo(data, '2.2')).toMatchObject({ sugerido: 'Vinte anos', refinando: true });
    expect(campo(data, '2.2').nova_sugestao).toBeFalsy();
    expect(data.job?.status).toBe('running');
    expect(data.job?.progresso?.etapa_atual).toBe(3);
    expect(data.progresso.decididos).toBe(1);
    expect(data.blocos[0].decididos).toBe(1);
  });

  it('campo em skip (editor aberto / decisão na fila) não recebe a sugestão nova', () => {
    const local = dados([blocoDe(2, [campoDe('2.1', 'Rascunho que estou editando'), campoDe('2.2', '')])]);
    const fresh = dados([blocoDe(2, [campoDe('2.1', 'Do worker'), campoDe('2.2', 'Do worker 2.2')])]);
    const { data, alteradas } = mergeFichaData(local, fresh, { skip: ['2.1'] });
    expect(alteradas).toEqual(['2.2']);
    expect(campo(data, '2.1').sugerido).toBe('Rascunho que estou editando');
    expect(campo(data, '2.1').nova_sugestao).toBeUndefined();
    expect(campo(data, '2.2').sugerido).toBe('Do worker 2.2');
  });

  it('decidido recebe complemento novo com a etiqueta; o mesmo complemento não marca de novo; decidir ou dispensar limpa', () => {
    const comp = { sugerido: 'Achado nos materiais', fonte: 'reunião', classe: 'Fato' as const, alternativas: [], recebido_em: '2026-09-04T10:00:00.000Z' };
    const local = dados([blocoDe(1, [editado11])]);
    const fresh = dados([blocoDe(1, [campoDe('1.1', 'Sugestão antiga', { status: 'editado', decidido: true, valor: 'Meu texto', valor_efetivo: 'Meu texto', complemento: comp })])]);
    const r1 = mergeFichaData(local, fresh);
    expect(r1.alteradas).toEqual(['1.1']);
    expect(campo(r1.data, '1.1')).toMatchObject({ valor: 'Meu texto', complemento: comp, nova_sugestao: true });
    // mesma leitura de novo: etiqueta continua (ainda nao decidiu), mas nao entra em `alteradas`
    const r2 = mergeFichaData(r1.data, fresh);
    expect(r2.alteradas).toEqual([]);
    expect(campo(r2.data, '1.1').nova_sugestao).toBe(true);
    // servidor sem complemento (dispensado em outro aparelho): some e a etiqueta cai
    const r3 = mergeFichaData(r2.data, dados([blocoDe(1, [campoDe('1.1', 'Sugestão antiga', { status: 'editado', decidido: true, valor: 'Meu texto', valor_efetivo: 'Meu texto' })])]));
    expect(campo(r3.data, '1.1')).toMatchObject({ complemento: null, nova_sugestao: false });
  });

  it('decisão de um sócio (servidor decidido, local não) entra sem etiqueta; status local em_revisao não é rebaixado', () => {
    const local = dados([blocoDe(2, [campoDe('2.1', 'x')])], { ficha_status: 'em_revisao' });
    const fresh = dados([blocoDe(2, [campoDe('2.1', 'x', { status: 'confirmado', decidido: true, valor: 'x', valor_efetivo: 'x' })])], { ficha_status: 'pre_preenchida' });
    const { data, alteradas } = mergeFichaData(local, fresh);
    expect(alteradas).toEqual([]);
    expect(campo(data, '2.1')).toMatchObject({ status: 'confirmado', decidido: true, nova_sugestao: false });
    expect(data.ficha_status).toBe('em_revisao');
    expect(mergeFichaData(dados([blocoDe(2, [campoDe('2.1', 'x')])]), dados([blocoDe(2, [campoDe('2.1', 'x')])], { ficha_status: 'confirmada' })).data.ficha_status).toBe('confirmada');
  });
});

describe('campoEmEdicaoNaTela', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('sem editor na tela: não está editando', () => {
    expect(campoEmEdicaoNaTela('2.1', 'sugerido')).toBe(false);
    expect(campoEmEdicaoNaTela('2.1', 'vazio')).toBe(false);
  });

  it('campo com sugestão: editor presente = "Editar" aberto', () => {
    document.body.innerHTML = '<div data-testid="wizard-editor-2.1"><textarea></textarea></div>';
    expect(campoEmEdicaoNaTela('2.1', 'sugerido')).toBe(true);
    expect(campoEmEdicaoNaTela('2.2', 'sugerido')).toBe(false);
  });

  it('campo vazio: o editor fica sempre na tela; só conta com foco ou texto digitado', () => {
    document.body.innerHTML = '<div data-testid="editor-1.2"><textarea id="t"></textarea><input type="checkbox" /></div>';
    expect(campoEmEdicaoNaTela('1.2', 'vazio')).toBe(false);
    (document.getElementById('t') as HTMLTextAreaElement).value = 'comecei a escrever';
    expect(campoEmEdicaoNaTela('1.2', 'vazio')).toBe(true);
    (document.getElementById('t') as HTMLTextAreaElement).value = '';
    expect(campoEmEdicaoNaTela('1.2', 'vazio')).toBe(false);
    (document.getElementById('t') as HTMLTextAreaElement).focus();
    expect(campoEmEdicaoNaTela('1.2', 'vazio')).toBe(true);
  });
});
