import {
  SCRIPT_FIELDS,
  SCRIPT_FIELD_KEYS,
  SCRIPT_REQUIRED_KEYS,
  SCRIPT_BLOCKS,
  SCRIPT_DAYS,
  SCRIPT_FIELD_BY_KEY,
  fieldsOfBlock,
  blockMinutes,
  isDecided,
} from '../../data/script-ficha-fields';
import { recomputeView } from '../../hooks/useScriptFicha';

const EXPECTED_KEYS = [
  '1.1', '1.2',
  '2.1', '2.2', '2.3', '2.4', '2.5',
  '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9',
  '4.1', '4.2', '4.3', '4.4',
  '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7',
  '6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7',
];

describe('script-ficha-fields (SPEC v0.1 secao 2)', () => {
  it('tem exatamente 34 campos com as chaves 1.1 a 6.7 na ordem da SPEC', () => {
    expect(SCRIPT_FIELDS).toHaveLength(34);
    expect(SCRIPT_FIELD_KEYS).toEqual(EXPECTED_KEYS);
    expect(new Set(SCRIPT_FIELD_KEYS).size).toBe(34);
  });

  it('tem 27 campos obrigatorios', () => {
    expect(SCRIPT_REQUIRED_KEYS).toHaveLength(27);
    const optional = SCRIPT_FIELDS.filter((f) => !f.obrigatorio).map((f) => f.key);
    expect(optional).toEqual(['1.2', '2.5', '3.9', '4.4', '5.7', '6.4', '6.7']);
  });

  it('tem 6 blocos com o numero de campos da SPEC', () => {
    expect(SCRIPT_BLOCKS.map((b) => b.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SCRIPT_BLOCKS.map((b) => b.nome)).toEqual(['Meta', 'Mentor', 'Mentorado', 'Método', 'A Mentoria', 'Venda']);
    expect([1, 2, 3, 4, 5, 6].map((n) => fieldsOfBlock(n).length)).toEqual([2, 5, 9, 4, 7, 7]);
  });

  it('cada campo tem pergunta, tipo valido, passo, fontes e minutos > 0', () => {
    const tipos = new Set(['tc', 'tx', 'ls', 'num', 'esc']);
    for (const f of SCRIPT_FIELDS) {
      expect(f.pergunta.trim().length).toBeGreaterThan(5);
      expect(tipos.has(f.tipo)).toBe(true);
      expect(f.passo.length).toBeGreaterThan(0);
      expect(f.fontes.length).toBeGreaterThan(0);
      expect(f.minutos).toBeGreaterThan(0);
      expect(f.bloco).toBe(Number(f.key.split('.')[0]));
    }
  });

  it('perguntas sao verbatim da SPEC em alguns pontos de controle', () => {
    expect(SCRIPT_FIELD_BY_KEY['1.1'].pergunta).toBe('Qual produto da sua esteira este script vende? (mais de um = um script por produto)');
    expect(SCRIPT_FIELD_BY_KEY['3.3'].pergunta).toBe('Que 3 frases ele diz sobre o problema?');
    expect(SCRIPT_FIELD_BY_KEY['5.3'].tipoRaw).toBe('ls nº');
    expect(SCRIPT_FIELD_BY_KEY['6.7'].tipo).toBe('num');
    expect(SCRIPT_FIELD_BY_KEY['2.5'].opcoes).toEqual(['Nunca vendi', 'Vendi algumas', 'Vendo há tempo']);
  });

  it('dia 1 = blocos 1 a 3 (~25 min) e dia 2 = blocos 4 a 6 (~27 min)', () => {
    expect(SCRIPT_DAYS.map((d) => d.blocos)).toEqual([[1, 2, 3], [4, 5, 6], []]);
    const dia1 = blockMinutes(1) + blockMinutes(2) + blockMinutes(3);
    const dia2 = blockMinutes(4) + blockMinutes(5) + blockMinutes(6);
    expect(dia1).toBeGreaterThanOrEqual(24);
    expect(dia1).toBeLessThanOrEqual(26);
    expect(dia2).toBeGreaterThanOrEqual(26);
    expect(dia2).toBeLessThanOrEqual(28);
  });

  it('nenhuma pergunta ou nome de campo usa travessão', () => {
    for (const f of SCRIPT_FIELDS) {
      expect(f.pergunta).not.toContain('—');
      expect(f.nome).not.toContain('—');
    }
  });

  it('isDecided reconhece confirmado, editado e aceito_vazio', () => {
    expect(isDecided('confirmado')).toBe(true);
    expect(isDecided('editado')).toBe(true);
    expect(isDecided('aceito_vazio')).toBe(true);
    expect(isDecided('sugerido')).toBe(false);
    expect(isDecided('vazio')).toBe(false);
  });

  it('recomputeView calcula "hoje" pelo primeiro dia com obrigatorio em aberto', () => {
    const blocos = SCRIPT_BLOCKS.map((b) => ({
      numero: b.numero, nome: b.nome, descricao: b.descricao,
      total: 0, decididos: 0, obrigatorios: 0, obrigatorios_decididos: 0, minutos: blockMinutes(b.numero), minutos_pendentes: 0, fechado: false,
      campos: fieldsOfBlock(b.numero).map((f) => ({
        key: f.key, bloco: f.bloco, nome: f.nome, pergunta: f.pergunta, tipo: f.tipo, tipoRaw: f.tipoRaw,
        obrigatorio: f.obrigatorio, minutos: f.minutos, opcoes: f.opcoes ?? null,
        sugerido: '', classe: 'VZ' as const, fonte: '', alternativas: [], status: 'vazio' as const,
        valor: '', valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null,
      })),
    }));
    const v0 = recomputeView(blocos);
    expect(v0.hoje.dia).toBe(1);
    expect(v0.progresso.obrigatorios).toBe(27);

    // decide todos os obrigatorios dos blocos 1 a 3
    const dia1 = blocos.map((b) => b.numero <= 3
      ? { ...b, campos: b.campos.map((c) => (c.obrigatorio ? { ...c, status: 'aceito_vazio' as const, decidido: true } : c)) }
      : b);
    const v1 = recomputeView(dia1);
    expect(v1.hoje.dia).toBe(2);
    expect(v1.blocos.slice(0, 3).every((b) => b.fechado)).toBe(true);

    const tudo = dia1.map((b) => ({ ...b, campos: b.campos.map((c) => (c.obrigatorio ? { ...c, status: 'aceito_vazio' as const, decidido: true } : c)) }));
    const v2 = recomputeView(tudo);
    expect(v2.hoje.dia).toBe(3);
    expect(v2.hoje.em_breve).toBe(true);
    expect(v2.progresso.obrigatorios_decididos).toBe(27);
  });
});

// ── Widgets: parse/render (components/script/widgets/estrutura.ts) e persistência da estrutura ──
import { createRequire } from 'module';
import { parseEstrutura, renderEstrutura, vaziaEstrutura, isWidgetType, ESTRUTURA } from '../../components/script/widgets';

const nodeRequire = createRequire(import.meta.url);
const SF = nodeRequire('../../utils/script-ficha.cjs');
const { scriptFieldsUpdateSchema } = nodeRequire('../../utils/validation.cjs');

const T = (key: string) => SCRIPT_FIELD_BY_KEY[key].template || {};

describe('widgets da ficha: definição por campo', () => {
  it('todos os 34 campos têm widget conhecido e template objeto', () => {
    for (const f of SCRIPT_FIELDS) {
      expect(isWidgetType(f.widget)).toBe(true);
      expect(typeof f.template).toBe('object');
    }
    expect(Object.keys(ESTRUTURA).sort()).toEqual([
      'antes_depois', 'baralho', 'canal', 'capa_livro', 'casos', 'chave_fechadura', 'checklist_condicoes', 'chips_texto', 'citacoes', 'dois_caminhos', 'dois_campos', 'dois_numeros', 'dois_textos',
      'escada', 'escolha', 'escolha_de_lista', 'frase', 'historia_podio', 'icp', 'lacunas', 'lista_numerada', 'meta', 'pilares', 'prateleira', 'quem_vende', 'radar', 'retorno', 'tabela', 'texto', 'vs',
    ]);
    // as metáforas da onda 2 e 3 compartilham a estrutura (e o valor) do widget base
    expect(ESTRUTURA.prateleira).toBe(ESTRUTURA.tabela);
    expect(ESTRUTURA.chave_fechadura).toBe(ESTRUTURA.tabela);
    expect(ESTRUTURA.retorno).toBe(ESTRUTURA.dois_numeros);
    expect(ESTRUTURA.radar).toBe(ESTRUTURA.chips_texto);
    expect(ESTRUTURA.dois_caminhos).toBe(ESTRUTURA.dois_textos);
    expect(ESTRUTURA.capa_livro).toBe(ESTRUTURA.dois_campos);
  });

  it('todos os 34 campos têm a linha "por que isso importa no script" (ajuda), sem travessão nem a palavra diagnóstico', () => {
    for (const f of SCRIPT_FIELDS) {
      expect(typeof f.ajuda).toBe('string');
      expect((f.ajuda || '').length).toBeGreaterThan(20);
      expect(f.ajuda).not.toContain('—');
      expect((f.ajuda || '').toLowerCase()).not.toContain('diagnóstico');
    }
    expect(SCRIPT_FIELD_BY_KEY['6.2'].ajuda).toBe('Define em que voz o script é escrito: na sua ou na de quem vende por você.');
  });

  it('mapa de widgets por campo segue o combinado', () => {
    const w = (k: string) => SCRIPT_FIELD_BY_KEY[k].widget;
    expect(w('1.1')).toBe('escolha'); expect(w('1.2')).toBe('meta');
    expect(w('2.1')).toBe('lacunas'); expect(w('2.2')).toBe('historia_podio'); expect(w('2.3')).toBe('vs'); expect(w('2.4')).toBe('frase'); expect(w('2.5')).toBe('escolha');
    expect(w('3.1')).toBe('icp'); expect(w('3.2')).toBe('chips_texto'); expect(w('3.3')).toBe('citacoes'); expect(w('3.4')).toBe('citacoes');
    expect(w('3.5')).toBe('antes_depois'); expect(w('3.6')).toBe('antes_depois'); expect(w('3.7')).toBe('prateleira'); expect(w('3.8')).toBe('lista_numerada'); expect(w('3.9')).toBe('chips_texto');
    expect(w('4.1')).toBe('capa_livro'); expect(w('4.2')).toBe('pilares'); expect(w('4.3')).toBe('escolha_de_lista'); expect(w('4.4')).toBe('tabela');
    expect(w('5.1')).toBe('lacunas'); expect(w('5.2')).toBe('tabela'); expect(w('5.3')).toBe('escada'); expect(w('5.4')).toBe('checklist_condicoes');
    expect(w('5.5')).toBe('retorno'); expect(w('5.6')).toBe('radar'); expect(w('5.7')).toBe('chave_fechadura');
    expect(w('6.1')).toBe('canal'); expect(w('6.2')).toBe('quem_vende'); expect(w('6.3')).toBe('baralho'); expect(w('6.4')).toBe('texto');
    expect(w('6.5')).toBe('dois_caminhos'); expect(w('6.6')).toBe('casos'); expect(w('6.7')).toBe('dois_numeros');
    expect(T('5.6').chips).toEqual(['tempo', 'rede', 'portas que abrem', 'conhecimento', 'segurança emocional', 'velocidade', 'status', 'tranquilidade da família']);
    expect(T('3.2').chips).toEqual(['sócio', 'cônjuge', 'família', 'decide sozinho']);
  });
});

describe('widgets da ficha: parse + render (ida e volta)', () => {
  const roundTrip = (w: any, e: any, t: any = {}, ctx: any = {}) => {
    const v = renderEstrutura(w, e, t);
    const back = parseEstrutura(w, v, t, ctx);
    expect(back.bruto).toBe(false);
    expect(back.estrutura).toEqual(e);
    expect(renderEstrutura(w, back.estrutura, t)).toBe(v);
    return v;
  };

  it('tabela: linhas com célula do meio vazia e coluna R$', () => {
    const t = T('3.7');
    const e = { linhas: [{ tentou: 'Consultoria genérica', custo: '5.000' }, { tentou: 'Curso online', custo: '' }] };
    const v = roundTrip('tabela', e, t);
    expect(v).toBe('Consultoria genérica · R$ 5.000\nCurso online');
    const e3 = { linhas: [{ item: 'Encontro em grupo', frequencia: '', duracao: '6 meses' }] };
    expect(roundTrip('tabela', e3, T('5.2'))).toBe('Encontro em grupo ·  · 6 meses');
  });

  it('escada: 3 níveis + condição', () => {
    const e = {
      alta: { nome: 'Premium', valor: '30.000', muda: 'acompanhamento semanal' },
      media: { nome: 'Grupo', valor: '12.000', muda: '' },
      entrada: { nome: '', valor: '', muda: '' },
      condicao: '30% no ato', obs: '',
    };
    expect(roundTrip('escada', e)).toBe('Mais alta: Premium · R$ 30.000 · acompanhamento semanal\nIntermediária: Grupo · R$ 12.000\nCondição de entrada: 30% no ato');
  });

  it('pilares: nome + o que resolve', () => {
    const e = { pilares: [{ nome: 'Mapa', resolve: 'mostra onde o tempo vai' }, { nome: 'Ritmo', resolve: '' }] };
    expect(roundTrip('pilares', e)).toBe('Mapa: mostra onde o tempo vai\nRitmo');
  });

  it('casos: blocos com pode citar', () => {
    const e = { casos: [{ nome: 'João', antes: '100 mil', depois: '300 mil', citar: 'sim' }, { nome: 'Dona de clínica em SP', antes: '', depois: 'saiu do balcão', citar: 'nao' }] };
    expect(roundTrip('casos', e)).toBe('Nome: João\nAntes: 100 mil\nDepois: 300 mil\nPode citar: sim\n\nNome: Dona de clínica em SP\nDepois: saiu do balcão\nPode citar: não');
  });

  it('checklist, canal, dois_numeros, meta, icp, vs, historia_podio, citacoes, lista, chips, dois_campos', () => {
    roundTrip('checklist_condicoes', {
      avista: { ativo: true, desconto: '10% de desconto' }, parcelado: { ativo: true, vezes: '12' }, contrato: { ativo: true, meses: '6' },
      contrapartida: { ativo: false, texto: '' }, garantia: { ativo: true, texto: '30 dias' }, obs: '',
    });
    expect(roundTrip('canal', { canal: 'ligacao', duracao: '45', reunioes: '2', obs: '' })).toBe('Canal: Ligação · Duração: 45 min · Reuniões: 2');
    expect(roundTrip('dois_numeros', { sozinho: '10.000', comigo: '50.000', prazo: '12 meses', obs: '' }, T('5.5'))).toBe('Sozinho: R$ 10.000 · Com você: R$ 50.000 · Prazo: 12 meses');
    expect(roundTrip('dois_numeros', { conversas: '3', dias: '21', obs: '' }, T('6.7'))).toBe('Conversas: 3 · Dias: 21');
    expect(roundTrip('meta', { clientes: '10', ate: 'dezembro', reunioes: '3', obs: '' })).toBe('10 clientes até dezembro · 3 reuniões por semana');
    roundTrip('icp', { setor: 'clínicas', papel: 'dono', tamanho: '5 a 30 pessoas', territorio: 'Sul', obs: '' });
    roundTrip('vs', { mercado: 'vende curso gravado', eu: 'entro na operação' });
    roundTrip('historia_podio', { historia: 'Vinte anos de clínica.', ouro: 'Três unidades', prata: 'Cem gestores', bronze: 'Livro publicado' });
    expect(roundTrip('citacoes', { citacoes: ['Não consigo sair', 'Não sobra'] })).toBe('"Não consigo sair"\n"Não sobra"');
    expect(roundTrip('lista_numerada', { itens: ['Faturamento', 'Equipe'], usos: ['', ''] })).toBe('1. Faturamento\n2. Equipe');
    expect(roundTrip('lista_numerada', { itens: ['Faturamento', 'Equipe'], usos: ['dimensionar a proposta', ''] })).toBe('1. Faturamento · para: dimensionar a proposta\n2. Equipe');
    expect(roundTrip('chips_texto', { chips: ['tempo', 'rede'], texto: 'Fim de semana de volta.' }, T('5.6'))).toBe('tempo, rede\nFim de semana de volta.');
    expect(roundTrip('dois_campos', { nome: 'Método X', fio: 'de A para B' }, T('4.1'))).toBe('Nome do método: Método X\nDe A para B em 1 frase: de A para B');
    roundTrip('dois_textos', { sim: 'contrato\ne pagamento', pensar: 'retorno em 48h' }, T('6.5'));
    expect(roundTrip('escolha', { opcao: 'Vendi algumas', texto: '' }, {}, { opcoes: ['Nunca vendi', 'Vendi algumas'] })).toBe('Vendi algumas');
    expect(roundTrip('escolha_de_lista', { escolhido: 'Processos', texto: '' }, {}, { pilares: ['Mapa', 'Processos'] })).toBe('Processos');
  });

  it('quem_vende (6.2): render determinístico e parse de ida e volta', () => {
    expect(roundTrip('quem_vende', { quem: 'closer', nome: 'Pedro', origem_lead: 'indicação e Instagram' })).toBe('Quem conduz: Um closer ou consultor do meu time (Pedro) / Lead: indicação e Instagram');
    expect(roundTrip('quem_vende', { quem: 'mentor', nome: '', origem_lead: '' })).toBe('Quem conduz: Eu mesmo(a)');
    expect(roundTrip('quem_vende', { quem: 'socio', nome: 'Caio', origem_lead: 'eventos' })).toBe('Quem conduz: Meu sócio ou sócia (Caio) / Lead: eventos');
    expect(roundTrip('quem_vende', { quem: 'outro', nome: 'Ana', origem_lead: '' })).toBe('Quem conduz: Outro (Ana)');
    // sem quem escolhido nao pode salvar (a voz do script depende disso)
    expect(renderEstrutura('quem_vende', { quem: '', nome: '', origem_lead: 'indicação' })).toBe('Lead: indicação');
  });

  it('quem_vende (6.2): heurística das sugestões antigas e do texto corrido', () => {
    const q = (t: string) => parseEstrutura('quem_vende', t);
    // formato antigo (dois_campos)
    expect(q('Quem conduz: a própria Paloma\nDe onde vem o lead: indicação e Instagram')).toEqual({ estrutura: { quem: 'mentor', nome: 'Paloma', origem_lead: 'indicação e Instagram' }, bruto: false });
    expect(q('Quem conduz: você\nDe onde vem o lead: Instagram').estrutura.quem).toBe('mentor');
    expect(q('Quem conduz: closer do time\nDe onde vem o lead: tráfego').estrutura).toEqual({ quem: 'closer', nome: '', origem_lead: 'tráfego' });
    expect(q('Quem conduz: sócio\nDe onde vem o lead: eventos').estrutura.quem).toBe('socio');
    // texto corrido
    expect(q('Eu mesma conduzo; os leads vêm de indicação.')).toEqual({ estrutura: { quem: 'mentor', nome: '', origem_lead: 'indicação' }, bruto: false });
    expect(q('Um closer do meu time (Pedro) conduz. Lead: Instagram e eventos.').estrutura).toEqual({ quem: 'closer', nome: 'Pedro', origem_lead: 'Instagram e eventos' });
    expect(q('A própria Paloma conduz e os leads vêm de indicação').estrutura).toEqual({ quem: 'mentor', nome: 'Paloma', origem_lead: 'indicação' });
    expect(q('Meu sócio Caio fecha as vendas').estrutura).toEqual({ quem: 'socio', nome: 'Caio', origem_lead: '' });
    expect(q('SDR agenda e o consultor fecha').estrutura.quem).toBe('closer');
    expect(q('Paloma').estrutura).toEqual({ quem: 'mentor', nome: 'Paloma', origem_lead: '' });
    // nada reconhecido: texto vai para a origem do lead e fica "bruto"
    expect(q('Depende do cliente.')).toEqual({ estrutura: { quem: '', nome: '', origem_lead: 'Depende do cliente.' }, bruto: true });
    expect(q('')).toEqual({ estrutura: { quem: '', nome: '', origem_lead: '' }, bruto: false });
  });

  it('texto corrido cai no primeiro slot livre com bruto = true; lista/tabela nunca são "brutas"', () => {
    expect(parseEstrutura('meta', 'Quero dobrar a carteira.')).toEqual({ estrutura: { clientes: '', ate: '', reunioes: '', obs: 'Quero dobrar a carteira.' }, bruto: true });
    expect(parseEstrutura('icp', 'Dono de clínica no Sul.').bruto).toBe(true);
    expect(parseEstrutura('escada', 'Ainda não defini preço.').bruto).toBe(true);
    expect(parseEstrutura('canal', 'Depende do cliente.').bruto).toBe(true);
    expect(parseEstrutura('tabela', 'Consultoria\nCurso', T('6.3')).bruto).toBe(false);
    expect(parseEstrutura('citacoes', 'a · b · c').estrutura.citacoes).toEqual(['a', 'b', 'c']);
    expect(parseEstrutura('escada', 'Premium R$ 30.000\nGrupo R$ 12.000').estrutura.media.valor).toBe('12.000');
    expect(vaziaEstrutura('tabela', T('4.4'), { pilares: ['Mapa', 'Ritmo'] }).linhas).toEqual([{ etapa: 'Mapa', trava: '', resolve: '' }, { etapa: 'Ritmo', trava: '', resolve: '' }]);
    expect(renderEstrutura('tabela', { linhas: [{ etapa: '', trava: '', resolve: '' }] }, T('4.4'))).toBe('');
  });
});

describe('script-ficha.cjs: estrutura persistida ao lado do valor', () => {
  it('editado guarda a estrutura; confirmado, aceito_vazio e desfazer limpam', () => {
    const est = { pilares: [{ nome: 'Mapa', resolve: 'tempo' }] };
    const r1 = SF.applyUpdates({}, { '4.2': { status: 'editado', valor: 'Mapa: tempo', estrutura: est } }, 'a@b.c');
    expect(r1.applied).toEqual(['4.2']);
    expect(r1.fields['4.2'].estrutura).toEqual(est);
    expect(r1.fields['4.2'].valor).toBe('Mapa: tempo');
    const view = SF.buildFichaView(r1.fields);
    const c42 = view.blocos[3].campos.find((c: any) => c.key === '4.2');
    expect(c42.estrutura).toEqual(est);
    expect(c42.widget).toBe('pilares');
    expect(c42.template.min).toBe(3);

    const r2 = SF.applyUpdates(r1.fields, { '4.2': { status: 'aceito_vazio' } }, 'a@b.c');
    expect(r2.fields['4.2'].estrutura).toBeNull();
    const withSug = { ...r1.fields, '4.2': { ...r1.fields['4.2'], sugerido: 'X: y' } };
    expect(SF.applyUpdates(withSug, { '4.2': { status: 'confirmado' } }, 'a@b.c').fields['4.2'].estrutura).toBeNull();
    expect(SF.applyUpdates(withSug, { '4.2': { status: 'sugerido' } }, 'a@b.c').fields['4.2'].estrutura).toBeNull();
    // estrutura invalida (array) vira null; sem estrutura tambem
    expect(SF.applyUpdates({}, { '4.2': { status: 'editado', valor: 'x', estrutura: [1] } }, 'a').fields['4.2'].estrutura).toBeNull();
    expect(SF.applyUpdates({}, { '4.2': { status: 'editado', valor: 'x' } }, 'a').fields['4.2'].estrutura).toBeNull();
    // normalizacao ignora estrutura em campo nao editado
    expect(SF.normalizeFieldState({ status: 'confirmado', sugerido: 'a', valor: 'a', estrutura: { x: 1 } }).estrutura).toBeNull();
  });

  it('scriptFieldsUpdateSchema aceita estrutura opcional (objeto) e recusa outros tipos', () => {
    expect(scriptFieldsUpdateSchema.safeParse({ updates: { '4.2': { status: 'editado', valor: 'x', estrutura: { pilares: [] } } } }).success).toBe(true);
    expect(scriptFieldsUpdateSchema.safeParse({ updates: { '4.2': { status: 'editado', valor: 'x' } } }).success).toBe(true);
    expect(scriptFieldsUpdateSchema.safeParse({ updates: { '4.2': { status: 'editado', valor: 'x', estrutura: 'nope' } } }).success).toBe(false);
  });
});
