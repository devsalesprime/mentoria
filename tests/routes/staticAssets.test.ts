// @ts-nocheck
/** @vitest-environment node */
/**
 * gzip e cache dos estaticos (utils/static-assets.cjs, usado pelo server.cjs).
 *
 * O server.cjs abre a porta ao ser importado, entao aqui o teste monta um app pequeno com AS MESMAS
 * funcoes (`compressao` e `estaticos`) e mede o header de verdade com supertest.
 *
 * O que precisa valer em producao:
 *  - JS/CSS do SPA e JSON da API saem com Content-Encoding: gzip quando o navegador aceita gzip;
 *  - arquivo em /assets/ tem hash no nome, entao vai com max-age de 1 ano e `immutable`;
 *  - index.html nunca fica em cache (aponta para os chunks com hash, que mudam a cada deploy).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

const { compressao, estaticos, CACHE_IMUTAVEL, CACHE_SEM_CACHE } = require('../../utils/static-assets.cjs');

let dist: string;
let app: any;

beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-teste-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  // acima do limite do compression (1 KB), senao ele nao comprime e o teste passa por engano
  const js = `/* bundle de teste */\n${'export const filler = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n'.repeat(80)}`;
  fs.writeFileSync(path.join(dist, 'assets', 'index-BSJAhk_V.js'), js);
  fs.writeFileSync(path.join(dist, 'assets', 'index-BSJAhk_V.css'), `.a{color:#fff}\n`.repeat(200));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html lang="pt-BR"><body>oi</body></html>');

  app = express();
  app.use(compressao());
  app.get('/api/teste', (_req: any, res: any) => {
    res.json({ success: true, itens: Array.from({ length: 200 }, (_v, i) => ({ i, nome: `campo ${i}` })) });
  });
  app.use(estaticos(dist));
});

afterAll(() => {
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('estaticos do SPA: gzip', () => {
  it('o JS com hash sai comprimido quando o navegador aceita gzip', async () => {
    const res = await request(app)
      .get('/assets/index-BSJAhk_V.js')
      .set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('o CSS com hash tambem sai comprimido', async () => {
    const res = await request(app).get('/assets/index-BSJAhk_V.css').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('o JSON da API sai comprimido', async () => {
    const res = await request(app).get('/api/teste').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.success).toBe(true);
  });

  it('quem nao aceita gzip continua recebendo o arquivo cru', async () => {
    const res = await request(app)
      .get('/assets/index-BSJAhk_V.js')
      .set('Accept-Encoding', 'identity');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.text).toContain('bundle de teste');
  });
});

describe('estaticos do SPA: cache', () => {
  it('arquivo em /assets/ (nome com hash) e imutavel por um ano', async () => {
    const res = await request(app).get('/assets/index-BSJAhk_V.js');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(CACHE_IMUTAVEL).toBe('public, max-age=31536000, immutable');
  });

  it('index.html nunca fica em cache', async () => {
    const res = await request(app).get('/index.html');
    expect(res.headers['cache-control']).toBe('no-store, must-revalidate');
    expect(CACHE_SEM_CACHE).toBe('no-store, must-revalidate');
  });
});

describe('server.cjs usa as duas funcoes', () => {
  const FONTE = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

  it('registra a compressao e serve o dist pelo modulo compartilhado', () => {
    expect(FONTE).toMatch(/require\('\.\/utils\/static-assets\.cjs'\)/);
    expect(FONTE).toMatch(/app\.use\(compressao\(\)\)/);
    expect(FONTE).toMatch(/app\.use\(estaticos\(path\.join\(__dirname, 'dist'\)\)\)/);
    // a compressao tem que entrar antes das rotas, senao a resposta ja saiu sem passar por ela
    expect(FONTE.indexOf('app.use(compressao())')).toBeLessThan(FONTE.indexOf("app.use(require('./routes/health.cjs')"));
  });
});
