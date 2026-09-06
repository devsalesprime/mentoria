// @ts-nocheck
/**
 * Gates de suficiencia com DOIS PERFIS (SPEC-workflow-v2-decisoes-06-09 §1, decisao 2):
 * avaliarSuficiencia(fields, { modo }) com 'essencial' olha so as 12 perguntas; sem `modo` (assinatura antiga,
 * dois argumentos ou um so) continua valendo 'completo', a regra de sempre.
 * Cobre tambem autoConfirmar({ modo }) e resumoSuficiencia, que carrega o modo para o admin.
 */
import fs from 'fs';
import path from 'path';
import SF from '../../utils/script-ficha.cjs';
import S from '../../utils/suficiencia.cjs';

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'suficiencia-campos.json'), 'utf8'));
const camposDe = (nome: string) => JSON.parse(JSON.stringify(FIX[nome]));
const fieldsDe = (campos: any) => SF.applyPrefill({}, campos).fields;
const JARGAO = /\b(job|cohort|gate|VZ|DER|classe|prefill|worker|runner|needs_human|essencial_keys)\b/i;
const foraDoEssencial = SF.FIELD_KEYS.filter((k: string) => !SF.ESSENCIAL_SET.has(k));

/** Esvazia as chaves pedidas (VZ, sem sugestao): o gate ve como "nao veio nos materiais". */
function esvaziar(campos: any, keys: string[]) {
  for (const k of keys) campos[k] = { sugerido: '', classe: 'VZ', fonte: '', alternativas: [] };
  return campos;
}

describe('escopo dos dois perfis', () => {
  it('essencial = subconjunto do completo; os criticos do essencial saem dos criticos gerais', () => {
    for (const k of SF.ESSENCIAL_KEYS) expect(SF.FIELD_KEYS).toContain(k);
    expect(SF.ESSENCIAL_KEYS.length).toBeLessThan(SF.FIELD_KEYS.length);
    for (const k of S.CRITICOS_ESSENCIAL) {
      expect(S.CRITICOS).toContain(k);
      expect(SF.ESSENCIAL_SET.has(k)).toBe(true);
    }
    // 1.1 (oferta) e critico no completo, mas nao entra nas 12
    expect(S.CRITICOS).toContain('1.1');
    expect(S.CRITICOS_ESSENCIAL).not.toContain('1.1');
  });
});

describe('assinatura compativel', () => {
  it('sem `modo` (um ou dois argumentos) o resultado e identico a { modo: "completo" }', () => {
    const fields = fieldsDe(camposDe('parcial'));
    const semModo = S.avaliarSuficiencia(fields);
    const doisArgs = S.avaliarSuficiencia(fields, { status: 'done' });
    const completo = S.avaliarSuficiencia(fields, { modo: 'completo' });
    expect(semModo.modo).toBe('completo');
    expect(doisArgs.modo).toBe('completo');
    expect(semModo.resultado).toBe(completo.resultado);
    expect(semModo.faltam).toEqual(completo.faltam);
    // modo desconhecido cai em 'completo'
    expect(S.avaliarSuficiencia(fields, { modo: 'resumido' }).modo).toBe('completo');
  });
});

describe('perfil essencial: so as 12 contam', () => {
  it('tudo o que esta fora das 12 vazio nao entra em `faltam` nem derruba o resultado', () => {
    const campos = esvaziar(camposDe('suficiente'), foraDoEssencial);
    const fields = fieldsDe(campos);
    const essencial = S.avaliarSuficiencia(fields, { modo: 'essencial' });
    const completo = S.avaliarSuficiencia(fields, { modo: 'completo' });

    expect(essencial.modo).toBe('essencial');
    for (const k of essencial.faltam) expect(SF.ESSENCIAL_SET.has(k)).toBe(true);
    // no completo os mesmos campos vazios derrubam o resultado
    expect(completo.obrigatorios_faltando).toBeGreaterThan(essencial.obrigatorios_faltando);
    expect(S.NIVEIS.indexOf(essencial.resultado)).toBeGreaterThanOrEqual(S.NIVEIS.indexOf(completo.resultado));
    for (const m of essencial.motivos) expect(m).not.toMatch(JARGAO);
  });

  it('uma das 12 vazia entra em `faltam` no essencial; o `faltam` do essencial cabe dentro do completo', () => {
    const campos = esvaziar(camposDe('suficiente'), ['3.3']);
    const r = S.avaliarSuficiencia(fieldsDe(campos), { modo: 'essencial' });
    expect(r.faltam).toContain('3.3');
    expect(r.criticos_ok).toBe(false);
    expect(r.resultado).not.toBe('suficiente');
    const completo = S.avaliarSuficiencia(fieldsDe(campos), { modo: 'completo' });
    for (const k of r.faltam) expect(completo.faltam).toContain(k);
  });

  it('campo fora das 12 com "a definir" ou travessao nao segura a ficha essencial', () => {
    const campos = camposDe('suficiente');
    campos['1.1'] = { sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'reunião', alternativas: [] };
    campos['3.5'] = { sugerido: 'Um ano igual — sem sair do balcão', classe: 'Fato', fonte: 'reunião', alternativas: [] };
    const r = S.avaliarSuficiencia(fieldsDe(campos), { modo: 'essencial' });
    expect(r.faltam).not.toContain('1.1');
    expect(r.faltam).not.toContain('3.5');
  });
});

describe('autoConfirmar por modo', () => {
  it('essencial: so as 12 sao tocadas; o resto fica em aberto para quando a pessoa aprofundar', () => {
    const fields = fieldsDe(camposDe('suficiente'));
    const ac = S.autoConfirmar(fields, { modo: 'essencial' });
    const mexidas = [...ac.confirmados, ...ac.vazios, ...ac.pendentes];
    for (const k of mexidas) expect(SF.ESSENCIAL_SET.has(k)).toBe(true);
    for (const k of foraDoEssencial) expect(SF.isDecided(ac.fields[k])).toBe(false);
    // o padrao (sem modo) continua confirmando a ficha inteira
    const completo = S.autoConfirmar(fields);
    expect([...completo.confirmados, ...completo.vazios, ...completo.pendentes].length).toBe(SF.FIELD_KEYS.length);
  });
});

describe('resumoSuficiencia', () => {
  it('carrega o modo avaliado (default completo)', () => {
    const fields = fieldsDe(camposDe('suficiente'));
    expect(S.resumoSuficiencia(S.avaliarSuficiencia(fields, { modo: 'essencial' })).modo).toBe('essencial');
    expect(S.resumoSuficiencia(S.avaliarSuficiencia(fields)).modo).toBe('completo');
  });
});
