import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScriptReader } from '../../components/script/script/ScriptReader';
import { ScriptPaper } from '../../components/script/script/ScriptPaper';
import { parseScript } from '../../components/script/script/parseScript';
import { TOTAL_NAV, TELA_SUMARIO, TELA_PREPARACAO, NAV_INICIO, navDoConteudo } from '../../components/script/script/telas';
import { AULA_7_PASSOS } from '../../data/aula-7-passos';

/**
 * A aula da Dani dentro do leitor "Seu script" (components/script/script/ScriptReader.tsx), depois da onda E1:
 * - tela 0 (Inicio): o cartao fecha o resumo, logo depois da lista dos 7 passos (o bloco "Como usar este
 *   script" saiu da tela em 09/09). E o UNICO lugar dela no leitor
 * - o cartao nasce com a CAPA ESTATICA da Bunny e o botao de tocar: nenhum player carrega sozinho e nada de
 *   previa animada (onda J, item 10)
 * - a barra do mapa perdeu os itens "Aula" e "Grifos"; a lista de grifos abre no botao flutuante
 * - as telas de passo nao tem mais "Ver na aula da Dani"
 * - a folha de impressao (ScriptPaper) traz so a linha "Aula de referência" com o link, sem player
 */

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
const DOC = parseScript(FIXTURE);

/** `tela` vem na coordenada de CONTEUDO (1 sumario, 2..8 passos, 9 preparacao); o leitor recebe a de navegacao. */
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
  it('Início: o cartao da aula fecha o resumo, depois da lista dos 7 passos; capa estatica, sem player', () => {
    const { reader } = abrir(TELA_SUMARIO);
    const cartao = within(reader).getByTestId('aula-dani');
    expect(within(cartao).getByText('Aprenda a lógica por trás do script')).toBeInTheDocument();
    expect(within(cartao).getByText(AULA_7_PASSOS.titulo)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: /^Assistir:/ })).toBeInTheDocument();
    expect(reader.querySelector('iframe')).toBeNull();
    // a capa vem do catalogo da aula e nao e previa animada (09/09, item 3d)
    expect(within(cartao).getByTestId('aula-thumb').getAttribute('src')).toBe(AULA_7_PASSOS.thumbUrl);
    const passos = reader.querySelector('section[aria-label="Os 7 passos"]')!;
    expect(passos).not.toBeNull();
    expect(passos.compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // o bloco recolhido "Como usar este script" saiu da tela 0 em 09/09 (item 3c)
    expect(reader.querySelector('[data-testid="como-usar"]')).toBeNull();
    expect(reader.textContent).not.toContain('Como usar este script');
  });

  it('Preparacao: nenhuma aula fora do Início, e nenhum player em lugar nenhum', () => {
    const { reader, nav } = abrir(TELA_PREPARACAO);
    expect(within(reader).queryByTestId('aula-dani')).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Aula da Dani sobre os 7 passos' })).toBeNull();
    expect(reader.querySelector('iframe')).toBeNull();
  });

  it('a barra tem Anterior, Proximo e o mapa das 9 telas (Início, 7 passos e Preparação); sem "Aula" e sem "Grifos"', () => {
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
    // com a pastilha na tela o papel ganha rodape vazio: ela cobria o texto em 390 px
    expect(screen.getByTestId('script-reader').className).toContain('script-reader-com-grifos');
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

  it('o cartão da aula no Início só carrega o player depois do toque, e a capa é estática', () => {
    const { reader } = abrir(TELA_SUMARIO);
    const cartao = within(reader).getByTestId('aula-dani');
    expect(cartao.querySelector('iframe')).toBeNull();
    // onda J (item 10) e 09/09 (item 3d): capa estática da Bunny, o mesmo `thumbnail_<hash>.jpg` que os
    // treinamentos por passo usam. O `thumbnail.jpg` sem hash respondia 404 e sumia com a capa
    const capa = within(cartao).getByTestId('aula-thumb').getAttribute('src') || '';
    expect(capa).toMatch(/\/thumbnail_[0-9a-f]+\.jpg$/);
    expect(capa).not.toContain('preview.webp');
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

/**
 * A pastilha de grifos paira sobre o papel em todos os tamanhos (onda J, item 7): ela e o unico caminho para a
 * lista de grifos, no celular e no desktop. Depois que o sumario entrou na tela 0, toda tela tem o que grifar,
 * entao ela aparece em todas, sempre com o rodape vazio no papel.
 */
describe('ScriptReader · pastilha de grifos', () => {
  const abrirNav = (telaNav: number) => render(
    <ScriptReader
      doc={DOC}
      clubNome="Elos Club"
      tela={telaNav}
      onTela={vi.fn()}
      documento="treinamento"
      marcadas={new Set()}
      comentariosDo={() => null}
      totalGrifos={2}
      onAbrirGrifos={vi.fn()}
      rootRef={React.createRef<HTMLDivElement>()}
    />
  );

  it('aparece em todas as telas, sem depender do tamanho', () => {
    for (let tela = NAV_INICIO; tela < TOTAL_NAV; tela++) {
      const montada = abrirNav(tela);
      const pastilha = screen.getByTestId('grifos-flutuante');
      expect(pastilha).toBeInTheDocument();
      expect(pastilha.className).not.toContain('lg:hidden');
      expect(screen.getByTestId('script-reader').className).toContain('script-reader-com-grifos');
      montada.unmount();
    }
  });

  it('sem quem abrir a lista, a pastilha não existe (modo amostra)', () => {
    render(
      <ScriptReader
        amostra
        doc={DOC}
        clubNome="Elos Club"
        tela={NAV_INICIO}
        onTela={vi.fn()}
        documento="treinamento"
        marcadas={new Set()}
        comentariosDo={() => null}
        totalGrifos={0}
        rootRef={React.createRef<HTMLDivElement>()}
      />
    );
    expect(screen.queryByTestId('grifos-flutuante')).toBeNull();
  });
});
