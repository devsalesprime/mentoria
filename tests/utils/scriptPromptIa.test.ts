// @ts-nocheck
/**
 * "Peca para a sua IA preencher": prompt gerado a partir de data/script-ficha-fields.json
 * e leitura leve da resposta colada (contagem por tag).
 */
import { buildPromptIA, parseRespostaIA, resumoRespostaIA, TAGS } from '../../utils/script-prompt-ia.cjs';
import { SCRIPT_FIELDS, SCRIPT_FIELD_KEYS, SCRIPT_BLOCKS } from '../../data/script-ficha-fields';

describe('buildPromptIA', () => {
  const prompt = buildPromptIA({ mentorNome: 'Ana Silva', clubNome: 'Clínica Livre', membros: ['Ana Silva', 'Beto Souza'] });
  const lines = prompt.split('\n');

  it('lista os 34 campos como "<chave>. <pergunta>", na ordem da ficha', () => {
    expect(SCRIPT_FIELDS).toHaveLength(34);
    const idx = SCRIPT_FIELDS.map((f) => lines.findIndex((l) => l.startsWith(`${f.key}. ${f.pergunta}`)));
    expect(idx.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    // nenhuma chave repetida como linha de campo
    const fieldLines = lines.filter((l) => /^\d\.\d+\. /.test(l));
    expect(fieldLines).toHaveLength(34);
    expect(fieldLines.map((l) => l.split('. ')[0])).toEqual(SCRIPT_FIELD_KEYS);
  });

  it('tem os 6 blocos com a frase dos 5 M\'s antes das perguntas', () => {
    for (const b of SCRIPT_BLOCKS) {
      const i = lines.indexOf(`BLOCO ${b.numero}. ${b.nome}`);
      expect(i).toBeGreaterThan(-1);
      expect(lines[i + 1]).toMatch(new RegExp(`^${b.nome}: `));
    }
    expect(prompt).toContain("5 M's");
  });

  it('explica as 3 tags, o formato por campo e a secao FONTES', () => {
    expect(prompt).toContain('### <chave> [CERTO|PARCIAL|INCERTO]');
    for (const t of TAGS) expect(prompt).toMatch(new RegExp(`\\[${t}\\] = `));
    expect(prompt).toContain('"não sei"');
    expect(prompt).toContain('Nunca invente números, nomes, clientes ou casos');
    expect(prompt).toContain('palavras do próprio mentor');
    expect(prompt).toContain('Responda em português');
    expect(prompt.trimEnd().split('\n').slice(-2)[0]).toBe('### FONTES');
  });

  it('cita o mentor, o clube e os socios; sem travessao; sem a palavra proibida', () => {
    expect(prompt).toContain('Ana Silva (Clínica Livre)');
    expect(prompt).toContain('script dos 7 passos da venda da mentoria de Ana Silva');
    expect(prompt).toContain('Ana Silva e Beto Souza');
    expect(prompt).not.toContain('—');
    expect(prompt.toLowerCase()).not.toContain('diagnóstico');
  });

  it('funciona sem nome nem clube', () => {
    const p = buildPromptIA({});
    expect(p).toContain('o mentor');
    expect(p.split('\n').filter((l) => /^\d\.\d+\. /.test(l))).toHaveLength(34);
  });
});

describe('parseRespostaIA', () => {
  it('conta secoes por tag e lista o que faltou', () => {
    const texto = [
      '### 1.1 [CERTO]', 'Mentoria Clínica Livre',
      '### 1.2 [PARCIAL]', '10 clientes até dezembro',
      '### 2.1 [INCERTO]', 'não sei',
      '### 2.2 [certo]', 'linha 1', 'linha 2',
      '### FONTES', '- documento X',
    ].join('\n');
    const p = parseRespostaIA(texto);
    expect(p.reconhecido).toBe(true);
    expect(p.campos).toBe(4);
    expect(p.certos).toBe(2);
    expect(p.parciais).toBe(1);
    expect(p.incertos).toBe(1);
    expect(p.faltam).toHaveLength(30);
    expect(p.tem_fontes).toBe(true);
    expect(p.resumo).toBe('4 campos: 2 certos, 1 parcial, 1 incerto');
  });

  it('formato nao reconhecido salva mesmo assim', () => {
    const p = parseRespostaIA('A mentoria vende consultoria para clínicas.');
    expect(p.reconhecido).toBe(false);
    expect(p.campos).toBe(0);
    expect(p.resumo).toBe('formato não reconhecido, salvamos mesmo assim');
    expect(resumoRespostaIA(null)).toBe('formato não reconhecido, salvamos mesmo assim');
  });

  it('ignora chaves desconhecidas e aceita "## 3.3 (PARCIAL)" com folga de formato', () => {
    const p = parseRespostaIA('## 3.3 (PARCIAL)\nfrase\n### 9.9 [CERTO]\nx\n###1.1[INCERTO]\nnão sei');
    expect(p.campos).toBe(2);
    expect(p.parciais).toBe(1);
    expect(p.incertos).toBe(1);
  });

  it('resumo com todos os 34', () => {
    const texto = SCRIPT_FIELD_KEYS.map((k, i) => `### ${k} [${i < 20 ? 'CERTO' : i < 28 ? 'PARCIAL' : 'INCERTO'}]\nresposta`).join('\n');
    expect(parseRespostaIA(texto).resumo).toBe('34 campos: 20 certos, 8 parciais, 6 incertos');
  });
});
