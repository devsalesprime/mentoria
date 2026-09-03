// @ts-nocheck
/** @vitest-environment node */
/**
 * Regra "sem a definir" (utils/script-ficha.cjs): placeholder nunca vira sugestao.
 * - isPlaceholder / sanitizeSugestao
 * - applyPrefill: campo com "a definir" vira vazio (texto em nota_interna); alternativa com placeholder some
 * - applyWorkerSuggestion: campo decidido volta para sugerido com o valor anterior em alternativas[0]
 * - limparADefinir: so campos nao decididos; relatorio por campo
 * - scripts/limpar-a-definir.cjs em banco temporario (dry-run nao grava; --aplicar grava)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import createDbHelpers from '../../utils/db-helpers.cjs';
import SF from '../../utils/script-ficha.cjs';

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'samples', 'prefill-exemplo.json'), 'utf8'));

describe('isPlaceholder', () => {
  it('reconhece as formas do feedback do dono', () => {
    for (const t of ['a definir', 'A definir com a gente', 'a confirmar', 'Não encontramos', 'nao encontramos nada', 'não sei', 'Nao localizado', '???', 'Ticket: a definir', 'Faturamento ???']) {
      expect(SF.isPlaceholder(t)).toBe(true);
    }
  });
  it('nao pega texto legitimo', () => {
    for (const t of ['R$ 5.000 por mês', 'Confirmar com o time', 'Definir metas trimestrais', 'Ele não sabe delegar', 'O que a definição diz', '']) {
      expect(SF.isPlaceholder(t)).toBe(false);
    }
  });
});

describe('sanitizeSugestao', () => {
  it('placeholder vira VZ com o texto em nota_interna', () => {
    const r = SF.sanitizeSugestao({ sugerido: 'a definir com a gente', classe: 'Fato', fonte: 'EB', nota_interna: 'nota' });
    expect(r).toMatchObject({ sugerido: '', classe: 'VZ', fonte: '', limpo: true });
    expect(r.nota_interna).toBe('nota\n[sugestão descartada: "a definir com a gente"]');
  });
  it('texto normal passa', () => {
    expect(SF.sanitizeSugestao({ sugerido: ' Mentoria X ', classe: 'DER', fonte: ' APP ' })).toEqual({ sugerido: 'Mentoria X', classe: 'DER', fonte: 'APP', nota_interna: '', limpo: false });
  });
});

describe('applyPrefill com placeholders', () => {
  it('campo "a definir" vira vazio e conta em limpos; alternativa com "???" some', () => {
    const campos = JSON.parse(JSON.stringify(sample.campos));
    campos['1.1'] = { sugerido: 'a definir', classe: 'Fato', fonte: 'EB', alternativas: [], nota_interna: '' };
    campos['2.1'] = { ...campos['2.1'], alternativas: [{ sugerido: '???', fonte: 'x' }, { sugerido: 'Alternativa boa', fonte: 'y' }] };
    const r = SF.applyPrefill({}, campos);
    expect(r.limpos).toEqual(['1.1']);
    expect(r.fields['1.1']).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
    expect(r.fields['1.1'].nota_interna).toContain('a definir');
    expect(r.fields['2.1'].alternativas).toEqual([{ sugerido: 'Alternativa boa', fonte: 'y' }]);
    expect(SF.missingRequired(r.fields)).toContain('1.1');
  });
});

describe('applyWorkerSuggestion (PUT /api/jobs/:id/campo)', () => {
  it('campo editado volta para sugerido; valor anterior em alternativas[0] "sua versão anterior"', () => {
    const base = SF.applyUpdates(SF.applyPrefill({}, sample.campos).fields, { '3.3': { status: 'editado', valor: 'Minha frase' } }, 'a@x.com').fields;
    const r = SF.applyWorkerSuggestion(base, '3.3', { sugerido: 'Frase nova do worker', classe: 'DER', fonte: 'contexto: nota', alternativas: [{ sugerido: 'Outra', fonte: 'audio' }] }, { job_id: 'job-1' });
    expect(r.reaberto).toBe(true);
    expect(r.field.status).toBe('sugerido');
    expect(r.field.sugerido).toBe('Frase nova do worker');
    expect(r.field.valor).toBe('');
    expect(r.field.alternativas[0]).toEqual({ sugerido: 'Minha frase', fonte: 'sua versão anterior' });
    expect(r.field.alternativas[1]).toEqual({ sugerido: 'Outra', fonte: 'audio' });
    expect(r.field.atualizado_por).toBe('worker:job-1');
    expect(SF.isDecided(r.field)).toBe(false);
  });

  it('campo confirmado: o sugerido confirmado vira "sua versão anterior"', () => {
    const base = SF.applyUpdates(SF.applyPrefill({}, sample.campos).fields, { '1.1': { status: 'confirmado' } }, 'a@x.com').fields;
    const antes = base['1.1'].sugerido;
    const r = SF.applyWorkerSuggestion(base, '1.1', { sugerido: 'Nome novo', classe: 'Fato', fonte: 'site' });
    expect(r.field.alternativas[0]).toEqual({ sugerido: antes, fonte: 'sua versão anterior' });
  });

  it('campo nao decidido: sugestao antiga vira "sugestão anterior"; placeholder vira vazio (limpo)', () => {
    const base = SF.applyPrefill({}, sample.campos).fields;
    const antes = base['2.1'].sugerido;
    const r = SF.applyWorkerSuggestion(base, '2.1', { sugerido: 'Nova', classe: 'DER', fonte: 'x' });
    expect(r.reaberto).toBe(false);
    expect(r.field.alternativas[0]).toEqual({ sugerido: antes, fonte: 'sugestão anterior' });
    const bad = SF.applyWorkerSuggestion(base, '2.2', { sugerido: 'não encontramos', classe: 'Fato', fonte: 'x' });
    expect(bad.limpo).toBe(true);
    expect(bad.field).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
    expect(bad.field.nota_interna).toContain('não encontramos');
  });

  it('campo desconhecido explode', () => {
    expect(() => SF.applyWorkerSuggestion({}, '9.9', { sugerido: 'x', classe: 'Fato', fonte: 'y' })).toThrow(/desconhecido/);
  });
});

describe('limparADefinir', () => {
  it('limpa so nao decididos e relata', () => {
    const fields = SF.normalizeFields({
      '1.1': { sugerido: 'a definir', classe: 'Fato', fonte: 'x', status: 'sugerido' },
      '1.2': { sugerido: 'a definir', classe: 'Fato', fonte: 'x', status: 'confirmado', valor: 'a definir' },
      '2.1': { sugerido: 'Bom', classe: 'Fato', fonte: 'x', status: 'sugerido', alternativas: [{ sugerido: 'a confirmar', fonte: '' }] },
      '2.2': { sugerido: 'Ok', classe: 'Fato', fonte: 'x', status: 'sugerido' },
    });
    const r = SF.limparADefinir(fields);
    expect(r.alterados.map((a) => a.key)).toEqual(['1.1', '2.1']);
    expect(r.fields['1.1']).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
    expect(r.fields['1.2']).toMatchObject({ status: 'confirmado', valor: 'a definir' }); // decidido: intocado
    expect(r.fields['2.1'].alternativas).toEqual([]);
    expect(r.alterados[1]).toMatchObject({ key: '2.1', alternativas_removidas: 1 });
    expect(r.fields['2.2'].sugerido).toBe('Ok');
  });
});

describe('scripts/limpar-a-definir.cjs', () => {
  let dir; let file;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limpar-a-definir-'));
    file = path.join(dir, 'x.db');
    const db = new sqlite3.Database(file);
    const h = createDbHelpers(db);
    await h.dbRun(`CREATE TABLE cohort_clubs (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo INTEGER DEFAULT 1)`);
    await h.dbRun(`CREATE TABLE script_fichas (id TEXT PRIMARY KEY, club_slug TEXT UNIQUE NOT NULL, fields JSON NOT NULL DEFAULT '{}', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await h.dbRun(`INSERT INTO cohort_clubs (slug, nome) VALUES ('c1', 'Clube 1'), ('c2', 'Clube 2')`);
    const f1 = { '1.1': { sugerido: 'a definir', classe: 'Fato', fonte: 'x', status: 'sugerido' }, '3.3': { sugerido: '???', classe: 'DER', fonte: 'y', status: 'sugerido' } };
    const f2 = { '1.1': { sugerido: 'Nome', classe: 'Fato', fonte: 'x', status: 'sugerido' } };
    await h.dbRun(`INSERT INTO script_fichas (id, club_slug, fields) VALUES ('f1', 'c1', ?), ('f2', 'c2', ?)`, [JSON.stringify(f1), JSON.stringify(f2)]);
    await new Promise((r) => db.close(r));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('dry-run relata sem gravar; --aplicar grava', async () => {
    const { run } = await import('../../scripts/limpar-a-definir.cjs');
    const prevArgv = process.argv; const prevEnv = process.env.DB_PATH;
    const logs = []; const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    try {
      process.env.DB_PATH = file;
      process.argv = ['node', 'x'];
      vi.resetModules();
      const dry = await (await import('../../scripts/limpar-a-definir.cjs')).run();
      expect(dry).toEqual({ clubes: 1, campos: 2 });
      expect(logs.join('\n')).toMatch(/DRY-RUN/);
      expect(logs.join('\n')).toMatch(/c1 \(Clube 1\): 2 campo/);
      expect(logs.join('\n')).toMatch(/c2 \(Clube 2\): nada a limpar/);
      let db = new sqlite3.Database(file); let h = createDbHelpers(db);
      let row = await h.dbGet(`SELECT fields FROM script_fichas WHERE club_slug = 'c1'`);
      expect(JSON.parse(row.fields)['1.1'].sugerido).toBe('a definir'); // nao gravou
      await new Promise((r) => db.close(r));

      process.argv = ['node', 'x', '--aplicar'];
      vi.resetModules();
      const applied = await (await import('../../scripts/limpar-a-definir.cjs')).run();
      expect(applied).toEqual({ clubes: 1, campos: 2 });
      db = new sqlite3.Database(file); h = createDbHelpers(db);
      row = await h.dbGet(`SELECT fields FROM script_fichas WHERE club_slug = 'c1'`);
      const f = JSON.parse(row.fields);
      expect(f['1.1']).toMatchObject({ status: 'vazio', sugerido: '', classe: 'VZ' });
      expect(f['3.3']).toMatchObject({ status: 'vazio', sugerido: '' });
      expect(f['1.1'].nota_interna).toContain('a definir');
      await new Promise((r) => db.close(r));
      expect(typeof run).toBe('function');
    } finally {
      process.argv = prevArgv;
      if (prevEnv === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = prevEnv;
      spy.mockRestore();
    }
  });
});
