import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';

/**
 * Amostra do script (onda I, item A1, decisao D2): o exemplo configurado pelo admin abre no MESMO leitor,
 * em modo leitura. Conteudo e navegacao inteiros; nada de grifo, comentario, tarefa, acao nem WhatsApp.
 * Nenhum clube e nenhuma versao ficam no codigo: tudo vem de GET /api/script/amostra.
 */

vi.mock('axios');
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, custom, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

import { AmostraScript, COPY_AMOSTRA_VOLTAR, nomeSemParenteses } from '../../components/script/AmostraScript';

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');

function mockAmostra(over: Record<string, unknown> = {}) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/amostra') {
      return { data: { success: true, amostra: { club_slug: 'clube-exemplo', club_nome: 'Clube Exemplo', versao: 5, content_md: FIXTURE, ...over } } };
    }
    throw new Error(`url inesperada ${url}`);
  });
}

beforeEach(() => { vi.clearAllMocks(); mockAmostra(); });

describe('AmostraScript: o exemplo em modo leitura', () => {
  it('abre com a faixa dizendo de quem é o script e o caminho de volta', async () => {
    const onVoltar = vi.fn();
    render(<AmostraScript token="t" onVoltar={onVoltar} />);
    expect(await screen.findByTestId('amostra-faixa')).toHaveTextContent('Exemplo: script do Clube Exemplo');
    const voltar = screen.getByTestId('amostra-voltar');
    expect(voltar).toHaveTextContent(COPY_AMOSTRA_VOLTAR);
    fireEvent.click(voltar);
    expect(onVoltar).toHaveBeenCalled();
  });

  it('a faixa tira o parêntese do nome do clube (onda J, item 27)', async () => {
    expect(nomeSemParenteses('Prosperus (script do Danilo)')).toBe('Prosperus');
    expect(nomeSemParenteses('Clube Exemplo')).toBe('Clube Exemplo');
    mockAmostra({ club_nome: 'Prosperus (script do Danilo)' });
    render(<AmostraScript token="t" onVoltar={vi.fn()} />);
    const faixa = await screen.findByTestId('amostra-faixa');
    expect(faixa).toHaveTextContent('Exemplo: script do Prosperus');
    expect(faixa.textContent).not.toContain('(');
  });

  it('não renderiza nenhum controle de interação sobre o script', async () => {
    render(<AmostraScript token="t" onVoltar={vi.fn()} />);
    await screen.findByTestId('script-reader');
    // a tela 0 é a do exemplo, não a do "seu script está pronto"; o resumo vem junto (onda J, item 9)
    expect(screen.getByTestId('intro-amostra')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'O seu script está pronto' })).toBeNull();
    expect(screen.getByText('Script dos 7 passos da venda')).toBeInTheDocument();
    // sem grifos: nem a dica, nem o botão flutuante da lista
    expect(screen.queryByTestId('dica-grifo')).toBeNull();
    expect(screen.queryByTestId('grifos-flutuante')).toBeNull();
    expect(screen.getByTestId('script-reader').className).not.toContain('script-reader-com-grifos');
    // sem ações e sem apresentação comercial
    expect(screen.queryByTestId('acoes-fim')).toBeNull();
    expect(screen.queryByTestId('cartao-apresentacao')).toBeNull();
    expect(screen.queryByText('Aprovar o script')).toBeNull();
    expect(screen.queryByText('Gerar apresentação')).toBeNull();
    // sem comentário e sem caixa de texto nenhuma
    expect(screen.queryByText('Enviar comentário')).toBeNull();
    expect(document.querySelectorAll('textarea').length).toBe(0);
    expect(document.querySelectorAll('input').length).toBe(0);
  });

  it('a navegação inteira funciona e nenhuma tela traz tarefa nem "Baixar a preparação"', async () => {
    render(<AmostraScript token="t" onVoltar={vi.fn()} />);
    await screen.findByTestId('script-reader');
    // os botões de entrada da tela 0 saíram em 09/09 (item 3a): quem anda é o rodapé e a barra
    expect(screen.queryByTestId('inicio-passo-1')).toBeNull();
    expect(screen.queryByTestId('inicio-preparacao')).toBeNull();
    fireEvent.click(screen.getByTestId('rodape-proximo'));
    await waitFor(() => expect(screen.getByTestId('script-reader').querySelector('[data-tela-atual="1"]')).toBeTruthy());
    // na amostra ninguém baixa nada, e o "baixe" do cartão saiu junto com ele
    expect(screen.queryByTestId('baixar-preparacao-tela')).toBeNull();
    expect(document.body.textContent).not.toMatch(/baixe/i);

    // percorre até a última tela: nenhuma delas mostra checkbox de tarefa nem chip de contagem
    for (let t = 2; t <= 8; t += 1) {
      fireEvent.click(screen.getByTestId('rodape-proximo'));
      await waitFor(() => expect(screen.getByTestId('script-reader').querySelector(`[data-tela-atual="${t}"]`)).toBeTruthy());
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.queryAllByTestId('chip-tarefas')).toHaveLength(0);
    }
    // na última tela o rodapé não oferece "Ir para as ações": não há ações na amostra
    expect(screen.queryByTestId('rodape-proximo')).toBeNull();
    expect(screen.getByTestId('rodape-anterior')).toBeInTheDocument();
    expect(screen.queryByTestId('baixar-preparacao-tela')).toBeNull();
  });

  it('sem amostra publicada, a tela explica em português e o "Voltar" continua lá', async () => {
    (axios.get as any).mockRejectedValue({ response: { status: 404, data: { message: 'Ainda não há um exemplo publicado.' } } });
    render(<AmostraScript token="t" onVoltar={vi.fn()} />);
    expect(await screen.findByTestId('amostra-erro')).toHaveTextContent('Ainda não há um exemplo publicado.');
    expect(screen.getByTestId('amostra-voltar')).toBeInTheDocument();
  });
});
