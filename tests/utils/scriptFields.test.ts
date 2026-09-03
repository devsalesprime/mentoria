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
