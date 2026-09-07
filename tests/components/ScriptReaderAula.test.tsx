import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScriptReader } from '../../components/script/script/ScriptReader';
import { ScriptPaper } from '../../components/script/script/ScriptPaper';
import { parseScript } from '../../components/script/script/parseScript';
import { TOTAL_NAV, TELA_CARTAO, TELA_SUMARIO, TELA_PREPARACAO, navDoConteudo } from '../../components/script/script/telas';
import { AULA_7_PASSOS } from '../../data/aula-7-passos';

/**
 * A aula da Dani dentro do leitor "Seu script" (components/script/script/ScriptReader.tsx), depois da onda E1:
 * - Sumario: o cartao vem logo depois da lista dos 7 passos e antes da premissa. E o UNICO lugar dela no leitor
 * - o cartao nasce com a thumbnail e o botao de tocar: nenhum player carrega sozinho (nada de autoplay)
 * - a barra do mapa perdeu os itens "Aula" e "Grifos"; a lista de grifos abre no botao flutuante
 * - as telas de passo nao tem mais "Ver na aula da Dani"
 * - a folha de impressao (ScriptPaper) traz so a linha "Aula de referência" com o link, sem player
 */

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
const DOC = parseScript(FIXTURE);

/** `tela` vem na coordenada de CONTEUDO (0 cartao, 1 sumario, 2..8 passos, 9 preparacao); o leitor recebe a de navegacao. */
function abrir(tela: number, onAbrirGrifos = vi.fn()) {
  const rootRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <ScriptReader
      doc={DOC}
      clubNome="Elos Club"
      tela={navDoConteudo(tela)}
      onTela={vi.fn()}
      documento="treinamento"
      marcadas={new Set()}
      comentariosDo={() => null}
      totalGrifos={2}
      onAbrirGrifos={onAbrirGrifos}
      rootRef={rootRef}
    />
  );
  const reader = screen.getByTestId('script-reader');
  const nav = screen.getByRole('navigation', { name: 'Índice do script' });
  return { ...utils, reader, nav };
}

describe('ScriptReader · aula da Dani', () => {
  it('Sumario: o cartao da aula vem depois da lista dos 7 passos e antes de "Como usar"; poster, sem player', () => {
    const { reader } = abrir(TELA_SUMARIO);
    const cartao = within(reader).getByTestId('aula-dani');
    expect(within(cartao).getByText('Aprenda a lógica por trás do script')).toBeInTheDocument();
    expect(within(cartao).getByText(AULA_7_PASSOS.titulo)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: /^Assistir:/ })).toBeInTheDocument();
    expect(reader.querySelector('iframe')).toBeNull();
    const passos = reader.querySelector('section[aria-label="Os 7 passos"]')!;
    const comoUsar = reader.querySelector('section[aria-label="Como usar este script"]')!;
    expect(passos).not.toBeNull();
    expect(comoUsar).not.toBeNull();
    expect(passos.compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cartao.compareDocumentPosition(comoUsar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Cartao e Preparacao: nenhuma aula fora do Sumario, e nenhum player em lugar nenhum', () => {
    for (const tela of [TELA_CARTAO, TELA_PREPARACAO]) {
      const { reader, nav, unmount } = abrir(tela);
      expect(within(reader).queryByTestId('aula-dani')).toBeNull();
      expect(within(nav).queryByRole('button', { name: 'Aula da Dani sobre os 7 passos' })).toBeNull();
      expect(reader.querySelector('iframe')).toBeNull();
      unmount();
    }
  });

  it('a barra tem Anterior, Proximo e o mapa das 11 telas (o Início entrou na frente); sem "Aula" e sem "Grifos"', () => {
    const abrirGrifos = vi.fn();
    const { nav } = abrir(TELA_SUMARIO, abrirGrifos);
    expect(within(nav).getByRole('button', { name: 'Tela anterior' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Próxima tela' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Aula da Dani sobre os 7 passos' })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Abrir a lista de grifos' })).toBeNull();
    expect(nav.querySelectorAll('.script-mapa-item')).toHaveLength(TOTAL_NAV);
    // a lista de grifos abre num botão flutuante, fora da barra
    const flutuante = screen.getByTestId('grifos-flutuante');
    expect(flutuante).toHaveTextContent('Grifos · 2');
    fireEvent.click(flutuante);
    expect(abrirGrifos).toHaveBeenCalled();
  });

  it('as telas de passo não têm mais "Ver na aula da Dani" nem o cartão da aula', () => {
    for (let tela = 2; tela <= 8; tela++) {
      const { reader, unmount } = abrir(tela);
      expect(within(reader).queryByRole('button', { name: 'Ver na aula da Dani' })).toBeNull();
      expect(within(reader).queryByTestId('aula-dani')).toBeNull();
      expect(reader.querySelector('iframe')).toBeNull();
      unmount();
    }
  });

  it('o cartão da aula no Sumário só carrega o player depois do toque', () => {
    const { reader } = abrir(TELA_SUMARIO);
    const cartao = within(reader).getByTestId('aula-dani');
    expect(cartao.querySelector('iframe')).toBeNull();
    expect(within(cartao).getByTestId('aula-thumb').getAttribute('src')).toContain('preview.webp');
    fireEvent.click(within(cartao).getByRole('button', { name: `Assistir: ${AULA_7_PASSOS.titulo}` }));
    expect(cartao.querySelector('iframe')!.getAttribute('src')).toBe(`${AULA_7_PASSOS.embedUrl}?autoplay=true`);
  });

  it('folha de impressao: so a linha "Aula de referência" com o link; nenhum player', () => {
    const { container } = render(
      <ScriptPaper doc={DOC} clubNome="Elos Club" versao={1} escritoEm="04/09/2026" docAtivo="d1" todosVisiveis refFor={() => () => undefined} comentariosDo={() => null} />
    );
    const linha = screen.getByTestId('aula-referencia');
    expect(linha).toHaveTextContent(`Aula de referência: ${AULA_7_PASSOS.titulo}`);
    expect(linha.querySelector('a')).toHaveAttribute('href', AULA_7_PASSOS.embedUrl);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-testid="aula-dani"]')).toBeNull();
  });

  it('copy do leitor: sem travessao e sem a palavra proibida nas partes novas', () => {
    const { reader, nav } = abrir(2);
    const texto = `${reader.textContent}${nav.textContent}`;
    expect(texto).not.toContain('Ver na aula da Dani');
    expect(texto).not.toContain('Abrir em tela cheia');
    expect(nav.textContent).not.toContain('—');
    expect(nav.textContent).not.toMatch(/diagn/i);
  });
});
