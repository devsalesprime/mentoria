// @ts-nocheck
/** @vitest-environment node */
/**
 * CSP do servidor (server.cjs, helmet): frame-src e child-src liberam os players embutidos (Bunny Stream para a aula
 * da Dani no leitor do script e para as recomendacoes; CursEduca legado). O server.cjs abre a porta ao ser importado,
 * entao o teste le o objeto `directives` direto do fonte e o avalia.
 */
import fs from 'fs';
import path from 'path';

const FONTE = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function directivesDoHelmet() {
  const bloco = /app\.use\(helmet\(\{[\s\S]*?\}\)\);/.exec(FONTE);
  expect(bloco, 'bloco app.use(helmet({...})) no server.cjs').not.toBeNull();
  const m = /directives:\s*(\{[\s\S]*?\n\s*\})/.exec(bloco[0]);
  expect(m, 'objeto directives dentro do helmet').not.toBeNull();
  return new Function(`return ${m[1]};`)();
}

describe('CSP (helmet) · players embutidos', () => {
  it('frame-src e child-src liberam self, Bunny (iframe.mediadelivery.net) e CursEduca (player.curseduca.com)', () => {
    const d = directivesDoHelmet();
    const esperado = ["'self'", 'https://iframe.mediadelivery.net', 'https://player.curseduca.com'];
    expect(d.frameSrc).toEqual(esperado);
    expect(d.childSrc).toEqual(esperado);
    expect(d.frameSrc.join(' ')).toContain('mediadelivery');
  });

  it('as outras diretivas seguem como estavam (default, script, style, font, img, connect)', () => {
    const d = directivesDoHelmet();
    expect(d.defaultSrc).toEqual(["'self'"]);
    expect(d.connectSrc).toEqual(["'self'"]);
    expect(d.scriptSrc).toContain("'self'");
    expect(d.styleSrc).toContain('https://fonts.googleapis.com');
    expect(d.fontSrc).toContain('https://fonts.gstatic.com');
    expect(d.imgSrc).toContain('https:');
  });
});
