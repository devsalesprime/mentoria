// @ts-nocheck
/**
 * Gates de suficiencia (utils/suficiencia.cjs), regra do dono de 04/09 (GATES-suficiencia.md):
 * - fixtures: suficiente, parcial, insuficiente, fonte unica, preco divergente (tests/fixtures/suficiencia-campos.json)
 * - criticos em VZ/DER = no maximo parcial; tolerancia 3 / 4 a 9 / 10+ nos obrigatorios
 * - 6.2 precisa de um condutor ("outro" sem nome nao vale); 4.3 aponta para um item de 4.2; 5.5 nunca bloqueia
 * - needs_human / confianca baixa rebaixa um nivel; placeholder, palavra vetada e travessao mandam o campo para o mentor
 * - autoConfirmar: sugestao -> confirmado (origem automatica), vazio nao critico -> aceito_vazio, critico vazio fica pendente
 * - mensagemMentor: <= 500 chars, sem jargao, com o link certo
 */
import fs from 'fs';
import path from 'path';
import SF from '../../utils/script-ficha.cjs';
import S from '../../utils/suficiencia.cjs';

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'suficiencia-campos.json'), 'utf8'));
const camposDe = (nome: string) => JSON.parse(JSON.stringify(FIX[nome]));
const fieldsDe = (campos: any) => SF.applyPrefill({}, campos).fields;
const avaliar = (campos: any, jobInfo: any = {}) => S.avaliarSuficiencia(fieldsDe(campos), jobInfo);
const JARGAO = /\b(job|cohort|gate|VZ|DER|classe|prefill|worker|runner|needs_human)\b/i;

describe('avaliarSuficiencia: os tres resultados', () => {
  it('suficiente: 10 criticos como Fato com fonte, 3 obrigatorios tolerados, 4 fontes distintas', () => {
    const r = avaliar(camposDe('suficiente'));
    expect(r.resultado).toBe('suficiente');
    expect(r.criticos_ok).toBe(true);
    expect(r.fontes_distintas).toBeGreaterThanOrEqual(2);
    expect(r.obrigatorios_faltando).toBeLessThanOrEqual(S.TOLERANCIA_SUFICIENTE);
    // Os tolerados (3.5 e 3.6 em DER, 6.5 vazio) aparecem em faltam, mas nao seguram o script
    expect(r.faltam).toEqual(['3.5', '3.6', '6.5']);
    expect(r.avaliado_em).toBeTruthy();
    for (const m of r.motivos) expect(m).not.toMatch(JARGAO);
  });

  it('parcial: critico vazio (5.3), critico so deducao (3.3) e 6.2 "outro" sem nome', () => {
    const r = avaliar(camposDe('parcial'));
    expect(r.resultado).toBe('parcial');
    expect(r.criticos_ok).toBe(false);
    expect(r.faltam).toEqual(expect.arrayContaining(['3.3', '5.3', '6.2']));
    expect(r.motivos.some((m) => /Preço e opções: não encontramos/.test(m))).toBe(true);
    expect(r.motivos.some((m) => /Dor, nas palavras dele: encontramos só uma dedução/.test(m))).toBe(true);
    expect(r.motivos.some((m) => /"outro" precisa do nome/.test(m))).toBe(true);
    for (const m of r.motivos) expect(m).not.toMatch(JARGAO);
    // motivos nao trazem o codigo do campo, so o nome
    for (const m of r.motivos) expect(m).not.toMatch(/\b\d\.\d\b/);
  });

  it('insuficiente: 10 ou mais obrigatorios sem resposta', () => {
    const r = avaliar(camposDe('insuficiente'));
    expect(r.resultado).toBe('insuficiente');
    expect(r.obrigatorios_faltando).toBeGreaterThanOrEqual(S.LIMITE_INSUFICIENTE);
    expect(r.faltam.length).toBeGreaterThanOrEqual(10);
    // 5.5 nunca bloqueia: nao entra em faltam mesmo vazio
    expect(r.faltam).not.toContain('5.5');
  });

  it('entre 4 e 9 obrigatorios sem resposta = parcial, mesmo com os criticos ok', () => {
    const campos = camposDe('suficiente');
    for (const k of ['2.2', '2.3', '3.2', '3.4']) campos[k] = { sugerido: '', classe: 'VZ', fonte: '', alternativas: [] };
    const r = avaliar(campos);
    expect(r.criticos_ok).toBe(true);
    expect(r.obrigatorios_faltando).toBe(7);
    expect(r.resultado).toBe('parcial');
  });
});

describe('avaliarSuficiencia: rebaixamento e coerencia', () => {
  it('needs_human rebaixa um nivel (suficiente -> parcial; parcial -> insuficiente) e nunca da suficiente', () => {
    expect(avaliar(camposDe('suficiente'), { status: 'needs_human' }).resultado).toBe('parcial');
    expect(avaliar(camposDe('parcial'), { status: 'needs_human' }).resultado).toBe('insuficiente');
    expect(avaliar(camposDe('insuficiente'), { status: 'needs_human' }).resultado).toBe('insuficiente');
    const r = avaliar(camposDe('suficiente'), { status: 'needs_human', job_id: 'job-1' });
    expect(r.job_id).toBe('job-1');
    expect(r.motivos.some((m) => /conferência sua/.test(m))).toBe(true);
  });

  it('confianca baixa no result do worker rebaixa um nivel', () => {
    expect(avaliar(camposDe('suficiente'), { status: 'done', result: { confianca: 'baixa' } }).resultado).toBe('parcial');
    expect(avaliar(camposDe('suficiente'), { status: 'done', result: { confianca: 'alta' } }).resultado).toBe('suficiente');
  });

  it('fonte unica entre os criticos = no maximo parcial', () => {
    const r = avaliar(camposDe('fonteUnica'));
    expect(r.fontes_distintas).toBe(1);
    expect(r.resultado).toBe('parcial');
    expect(r.motivos.some((m) => /uma fonte só/.test(m))).toBe(true);
  });

  it('5.3 com alternativa de preco divergente = parcial "preço não fechado"', () => {
    const r = avaliar(camposDe('precoDivergente'));
    expect(r.resultado).toBe('parcial');
    expect(r.faltam).toContain('5.3');
    expect(r.motivos).toContain('Preço e opções: preço não fechado (os materiais trazem valores diferentes).');
    // o mesmo valor escrito de outro jeito nao e divergencia
    const campos = camposDe('suficiente');
    campos['5.3'] = { sugerido: 'Mentoria em grupo · R$ 14.000 · 6 meses', classe: 'Fato', fonte: 'Proposta fictícia · p3', alternativas: [{ sugerido: 'Grupo, R$ 14 mil por 6 meses', fonte: 'Transcrição fictícia · 40 min' }] };
    expect(avaliar(campos).faltam).not.toContain('5.3');
  });

  it('6.2 sem condutor = parcial; mentor, closer, consultor ou socio valem; "outro" com nome vale', () => {
    const base = camposDe('suficiente');
    const com = (texto: string) => avaliar({ ...base, '6.2': { sugerido: texto, classe: 'Fato', fonte: 'Briefing fictício do CSM · Venda', alternativas: [] } });
    expect(com('Lead chega por indicação e Instagram.').faltam).toContain('6.2');
    expect(com('Lead chega por indicação e Instagram.').resultado).toBe('parcial');
    expect(com('Eu mesma conduzo; lead por indicação.').faltam).not.toContain('6.2');
    expect(com('Um closer do time conduz; lead vem do Instagram.').faltam).not.toContain('6.2');
    expect(com('Minha sócia conduz; lead por evento.').faltam).not.toContain('6.2');
    expect(com('Outro (Pedro); lead por indicação.').faltam).not.toContain('6.2');
    expect(com('Outro; lead por indicação.').faltam).toContain('6.2');
  });

  it('6.2 decidido pelo widget: quem "outro" sem nome nao vale; com nome vale', () => {
    const fields = fieldsDe(camposDe('suficiente'));
    const semNome = { ...fields, '6.2': { ...fields['6.2'], status: 'editado', valor: 'Quem conduz: Outro / Lead: indicação', estrutura: { quem: 'outro', nome: '', origem_lead: 'indicação' } } };
    expect(S.avaliarSuficiencia(semNome).faltam).toContain('6.2');
    const comNome = { ...fields, '6.2': { ...fields['6.2'], status: 'editado', valor: 'Quem conduz: Outro (Pedro) / Lead: indicação', estrutura: { quem: 'outro', nome: 'Pedro', origem_lead: 'indicação' } } };
    expect(S.avaliarSuficiencia(comNome).faltam).not.toContain('6.2');
  });

  it('4.3 precisa apontar para um item de 4.2 (nome ou numero do pilar)', () => {
    const base = camposDe('suficiente');
    const com = (texto: string) => avaliar({ ...base, '4.3': { sugerido: texto, classe: 'Fato', fonte: 'Transcrição fictícia · 18 min', alternativas: [] } });
    expect(com('Processos mínimos').faltam).not.toContain('4.3');
    expect(com('O pilar Gerente em formação, que prepara quem assume').faltam).not.toContain('4.3');
    expect(com('Pilar 2').faltam).not.toContain('4.3');
    const fora = com('Marketing de atração');
    expect(fora.faltam).toContain('4.3');
    expect(fora.resultado).toBe('parcial');
    expect(fora.motivos).toContain('Pilar que resolve a dor principal: precisa ser um dos pilares ou etapas do seu método.');
  });

  it('5.5 sem fonte fica vazio e nao bloqueia; numero deduzido em campo numerico nunca conta', () => {
    const base = camposDe('suficiente');
    expect(avaliar({ ...base, '5.5': { sugerido: 'Sozinho R$ 20 mil, comigo R$ 60 mil em 12 meses', classe: 'DER', fonte: 'derivado de 5.3', alternativas: [] } }).resultado).toBe('suficiente');
    const der67 = avaliar({ ...base, '6.7': { sugerido: '2 conversas em 10 dias', classe: 'DER', fonte: 'derivado de 6.1', alternativas: [] } });
    expect(der67.resultado).toBe('suficiente'); // 6.7 e opcional: nao bloqueia, mas nao conta
    const der53 = avaliar({ ...base, '5.3': { sugerido: 'Entrada: R$ 14.000', classe: 'DER', fonte: 'derivado da proposta', alternativas: [] } });
    expect(der53.resultado).toBe('parcial');
    expect(der53.faltam).toContain('5.3');
  });

  it('placeholder, palavra vetada e travessao na sugestao mandam o campo para o mentor (no maximo parcial)', () => {
    const base = camposDe('suficiente');
    // O import ja converte "a definir" em vazio (nota interna); avaliando os campos crus, o motivo e explicito
    const crus = fieldsDe(base);
    const a = S.avaliarSuficiencia({ ...crus, '2.2': { ...crus['2.2'], sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'x' } });
    expect(a.faltam).toContain('2.2');
    expect(a.motivos.some((m) => /a definir/.test(m))).toBe(true);
    expect(a.resultado).toBe('parcial');
    // Depois do import, o mesmo campo chega vazio e entra em faltam como resposta que faltou
    const importado = avaliar({ ...base, '2.2': { sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'x', alternativas: [] } });
    expect(importado.faltam).toContain('2.2');
    const b = avaliar({ ...base, '2.3': { sugerido: 'Faço um diagnóstico completo da clínica.', classe: 'Fato', fonte: 'x', alternativas: [] } });
    expect(b.faltam).toContain('2.3');
    expect(b.resultado).toBe('parcial');
    const c = avaliar({ ...base, '2.4': { sugerido: 'Porque vi clínicas fecharem — e doeu.', classe: 'Fato', fonte: 'x', alternativas: [] } });
    expect(c.faltam).toContain('2.4');
    expect(c.resultado).toBe('parcial');
  });

  it('campo decidido pelo mentor conta como preenchido (mesmo sem Fato); critico aceito em branco nao', () => {
    const fields = fieldsDe(camposDe('parcial'));
    const { fields: f2 } = SF.applyUpdates(fields, {
      '5.3': { status: 'editado', valor: 'Completa R$ 24.000 · Entrada R$ 14.000' },
      '3.3': { status: 'editado', valor: 'Não consigo sair da clínica nem por um dia.' },
      '6.2': { status: 'editado', valor: 'Eu mesma conduzo; lead por indicação.' },
    }, 'ana@x.com');
    const r = S.avaliarSuficiencia(f2);
    expect(r.criticos_ok).toBe(true);
    expect(r.resultado).toBe('suficiente');
    const { fields: f3 } = SF.applyUpdates(f2, { '6.2': { status: 'aceito_vazio' } }, 'ana@x.com');
    const r3 = S.avaliarSuficiencia(f3);
    expect(r3.criticos_ok).toBe(false);
    expect(r3.faltam).toContain('6.2');
    expect(r3.motivos).toContain('Quem vende e de onde vem o lead: não pode ficar em branco.');
  });
});

describe('autoConfirmar', () => {
  it('sugestao vira confirmado com origem automatica; vazio nao critico vira aceito_vazio; decidido nao muda', () => {
    const fields = fieldsDe(camposDe('suficiente'));
    const { fields: comDecisao } = SF.applyUpdates(fields, { '1.1': { status: 'editado', valor: 'Minha mentoria' } }, 'ana@x.com');
    const r = S.autoConfirmar(comDecisao);
    expect(r.pendentes).toEqual([]);
    expect(r.confirmados).toContain('2.1');
    expect(r.confirmados).not.toContain('1.1');
    expect(r.vazios).toEqual(expect.arrayContaining(['6.5', '5.5']));
    expect(r.fields['2.1']).toMatchObject({ status: 'confirmado', valor: comDecisao['2.1'].sugerido, atualizado_por: 'automatica' });
    expect(r.fields['1.1']).toMatchObject({ status: 'editado', valor: 'Minha mentoria', atualizado_por: 'ana@x.com' });
    expect(r.fields['6.5']).toMatchObject({ status: 'aceito_vazio', atualizado_por: 'automatica' });
    expect(SF.missingRequired(r.fields)).toEqual([]);
  });

  it('critico vazio fica pendente (nunca aceito em branco); numero deduzido fica em branco', () => {
    const campos = camposDe('parcial');
    campos['6.7'] = { sugerido: '2 conversas em 10 dias', classe: 'DER', fonte: 'derivado', alternativas: [] };
    const r = S.autoConfirmar(fieldsDe(campos));
    expect(r.pendentes).toEqual(['5.3']);
    expect(r.fields['5.3'].status).toBe('vazio');
    expect(r.fields['6.7']).toMatchObject({ status: 'aceito_vazio', atualizado_por: 'automatica' });
  });
});

describe('mensagemMentor', () => {
  it('tres mensagens, sem jargao, ate 500 chars, com o link certo', () => {
    const s = S.mensagemMentor('suficiente', { nome: 'Ana Paula' });
    expect(s).toBe('Ana, lemos os seus materiais e já temos o que precisamos. Seu script está sendo gerado, chega em alguns minutos.');
    const p = S.mensagemMentor('parcial', { faltam_n: 3, appUrl: 'https://app.teste.local/' });
    expect(p).toContain('Faltam 3 respostas suas');
    expect(p).toContain('https://app.teste.local/prosperus-mentor-diagnosis/dashboard/ficha');
    expect(S.mensagemMentor('parcial', { faltam_n: 1 })).toContain('Falta 1 resposta sua');
    const i = S.mensagemMentor('insuficiente', { appUrl: 'https://app.teste.local' });
    expect(i).toContain('Precisamos de mais material');
    expect(i).toContain('https://app.teste.local/prosperus-mentor-diagnosis/dashboard/materiais');
    for (const m of [s, p, i]) {
      expect(m.length).toBeLessThanOrEqual(500);
      expect(m).not.toMatch(JARGAO);
      expect(m).not.toContain('—');
    }
  });
});
