import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ScriptReader } from '../../components/script/script/ScriptReader';
import { ScriptPaper } from '../../components/script/script/ScriptPaper';
import { parseScript } from '../../components/script/script/parseScript';
import { TOTAL_TELAS, TELA_CARTAO, TELA_SUMARIO, TELA_PREPARACAO } from '../../components/script/script/telas';
import { AULA_7_PASSOS } from '../../data/aula-7-passos';

/**
 * A aula da Dani dentro do leitor "Seu script" (components/script/script/ScriptReader.tsx):
 * - Sumario: o cartao vem logo depois da lista dos 7 passos e antes da premissa
 * - a barra tem o item "Aula" em toda tela; abre a folha (dialog) com o player; numa tela de passo, ja no passo
 * - cada uma das 7 telas de passo tem "Ver na aula da Dani" sob o titulo, que abre a mesma folha no passo
 * - a folha de impressao (ScriptPaper) traz so a linha "Aula de referência" com o link, sem player
 */

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
const DOC = parseScript(FIXTURE);

function abrir(tela: number) {
  const rootRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <ScriptReader
      doc={DOC}
      clubNome="Elos Club"
      tela={tela}
      onTela={vi.fn()}
      documento="treinamento"
      onDocumento={vi.fn()}
      marcadas={new Set()}
      comentariosDo={() => null}
      totalGrifos={2}
      onAbrirGrifos={vi.fn()}
      rootRef={rootRef}
    />
  );
  const reader = screen.getByTestId('script-reader');
  const nav = screen.getByRole('navigation', { name: 'Índice do script' });
  return { ...utils, reader, nav };
}

async function folhaAberta() {
  return screen.findByRole('dialog', { name: 'Aula de referência' });
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

  it('Cartao e Preparacao: sem cartao na folha, mas o item "Aula" da barra abre a folha de qualquer tela e fecha', async () => {
    for (const tela of [TELA_CARTAO, TELA_PREPARACAO]) {
      const { reader, nav, unmount } = abrir(tela);
      expect(within(reader).queryByTestId('aula-dani')).toBeNull();
      const item = within(nav).getByRole('button', { name: 'Aula da Dani sobre os 7 passos' });
      expect(item).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(item);
      const folha = await folhaAberta();
      // (com a folha modal aberta, o Radix esconde o resto da pagina dos leitores de tela: hidden: true)
      expect(within(nav).getByRole('button', { name: 'Aula da Dani sobre os 7 passos', hidden: true })).toHaveAttribute('aria-expanded', 'true');
      const iframe = folha.querySelector('iframe')!;
      expect(iframe).not.toBeNull();
      expect(iframe.getAttribute('src')).toContain('iframe.mediadelivery.net/embed/716048/');
      expect(iframe.getAttribute('allow')).toContain('autoplay');
      expect(within(folha).queryByTestId('aula-capitulo')).toBeNull();
      fireEvent.click(within(folha).getByRole('button', { name: 'Fechar a aula' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      unmount();
    }
  });

  it('a barra sempre tem Anterior, Aula, Grifos e Proximo, alem do mapa de 10 telas', () => {
    const { nav } = abrir(TELA_SUMARIO);
    expect(within(nav).getByRole('button', { name: 'Tela anterior' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Aula da Dani sobre os 7 passos' })).toHaveTextContent('Aula');
    expect(within(nav).getByRole('button', { name: 'Abrir a lista de grifos' })).toHaveTextContent('Grifos · 2');
    expect(within(nav).getByRole('button', { name: 'Próxima tela' })).toBeInTheDocument();
    expect(nav.querySelectorAll('.script-mapa-item')).toHaveLength(TOTAL_TELAS);
  });

  it('as 7 telas de passo tem "Ver na aula da Dani" sob o titulo; abre a folha ja no passo', async () => {
    for (let tela = 2; tela <= 8; tela++) {
      const { reader, unmount } = abrir(tela);
      const header = reader.querySelector('.script-passo-tela header')!;
      expect(within(header as HTMLElement).getByRole('button', { name: 'Ver na aula da Dani' })).toBeInTheDocument();
      expect(within(reader).queryByTestId('aula-dani')).toBeNull();
      unmount();
    }
    const { reader } = abrir(3);
    fireEvent.click(within(reader).getByRole('button', { name: 'Ver na aula da Dani' }));
    const folha = await folhaAberta();
    expect(within(folha).getByTestId('aula-capitulo')).toHaveTextContent('Passo 2 · Investigação');
    expect(folha.querySelector('iframe')!.getAttribute('src')).toBe(`${AULA_7_PASSOS.embedUrl}?autoplay=true`);
  });

  it('numa tela de passo, o item "Aula" da barra abre a folha no passo da tela', async () => {
    const { nav } = abrir(6);
    fireEvent.click(within(nav).getByRole('button', { name: 'Aula da Dani sobre os 7 passos' }));
    const folha = await folhaAberta();
    expect(within(folha).getByTestId('aula-capitulo')).toHaveTextContent('Passo 5 · Negociação e fechamento');
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
    expect(texto).toContain('Ver na aula da Dani');
    expect(nav.textContent).not.toContain('—');
    expect(nav.textContent).not.toMatch(/diagn/i);
  });
});
