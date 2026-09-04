import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { ScriptPrintPage, nomeArquivo, docDaQuery, slugArquivo } from '../../components/script/script/ScriptPrintPage';

vi.mock('axios');

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');

function mockApi(md: string) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/ficha') return { data: { success: true, data: { club: { slug: 'elos', nome: 'Elos Club' } } } };
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v2', versao: 2, status: 'rascunho', created_at: '2026-09-04 10:00:00' }, { id: 'v1', versao: 1, status: 'aprovado', created_at: '2026-09-03 10:00:00' }], job: null } };
    if (url === '/api/script/versoes/2') return { data: { success: true, versao: { id: 'v2', versao: 2, status: 'rascunho', content_md: md, created_at: '2026-09-04 10:00:00', aprovado_em: null }, comentarios: [] } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'aprovado', content_md: md.replace('Elos Club', 'Elos Club v1'), created_at: '2026-09-03 10:00:00', aprovado_em: '2026-09-03 12:00:00' }, comentarios: [] } };
    throw new Error('url inesperada ' + url);
  });
}

function abrir(query: string, autoPrint = false) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/script/imprimir${query}`]}>
      <ScriptPrintPage token="t" autoPrint={autoPrint} />
    </MemoryRouter>
  );
}

function passosDe(container: HTMLElement, docId: string): number {
  return container.querySelectorAll(`section[data-doc="${docId}"] section.script-passo`).length;
}

describe('ScriptPrintPage (pagina de impressao, fora do Dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'app';
  });

  it('nomes de arquivo e leitura da query', () => {
    expect(slugArquivo('Elos Club')).toBe('Elos-Club');
    expect(slugArquivo('Ação & Cia')).toBe('Acao-Cia');
    expect(nomeArquivo('treinamento', 'Elos Club')).toBe('Documento-de-treinamento-Elos-Club');
    expect(nomeArquivo('campo', 'Elos Club')).toBe('Script-de-campo-Elos-Club');
    expect(nomeArquivo('ambos', '')).toBe('Script-7-passos-clube');
    expect(docDaQuery('campo')).toBe('campo');
    expect(docDaQuery('treinamento')).toBe('treinamento');
    expect(docDaQuery('x')).toBe('ambos');
    expect(docDaQuery(null)).toBe('ambos');
  });

  it('doc=campo: so o Documento 2, com os 7 "## Passo", mapa e cartao; titulo vira o nome do PDF', async () => {
    mockApi(FIXTURE);
    const { container } = abrir('?doc=campo');
    await screen.findByText('Script dos 7 passos da venda');
    expect(passosDe(container, 'd2')).toBe(7);
    expect(passosDe(container, 'd1')).toBe(0);
    const d2 = container.querySelector('section[data-doc="d2"]')!;
    expect(d2.className).toContain('block');
    expect(Array.from(d2.querySelectorAll('section.script-passo .script-h2')).map((h) => h.textContent)).toEqual([
      'Conexão (com Abertura)', 'Investigação (Método CNCS)', 'Apresentação (da Solução)', 'Validação e Antecipação de Objeções',
      'Negociação e Fechamento', 'Compromisso', 'Recomendação (Método EVPC)',
    ]);
    expect(container.querySelector('.script-mapa')).not.toBeNull();
    expect(container.querySelector('#script-cartao')).not.toBeNull();
    expect(container.querySelector('.script-premissa')).toBeNull();
    await waitFor(() => expect(document.title).toBe('Script-de-campo-Elos-Club'));
    expect(screen.getByText('Script de campo')).toBeInTheDocument();
    expect(screen.getByText(/versão 2/)).toBeInTheDocument();
    // nada de barra fixa nem leitor: so a folha
    expect(container.querySelector('.script-barra')).toBeNull();
    expect(container.querySelector('[data-testid="script-reader"]')).toBeNull();
  });

  it('doc=treinamento: so o Documento 1 (7 passos, performance e metricas), sem mapa nem cartao; versao pedida na query', async () => {
    mockApi(FIXTURE);
    const { container } = abrir('?doc=treinamento&versao=1');
    await screen.findByText('Script dos 7 passos da venda');
    expect(passosDe(container, 'd1')).toBe(7);
    expect(passosDe(container, 'd2')).toBe(0);
    expect(container.querySelector('.script-mapa')).toBeNull();
    expect(container.querySelector('#script-cartao')).toBeNull();
    expect(screen.getByText('Performance e métricas')).toBeInTheDocument();
    expect(screen.getByText(/versão 1/)).toBeInTheDocument();
    expect(screen.getByText(/aprovado em/)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Documento-de-treinamento-Elos-Club'));
  });

  it('doc=ambos (ou sem doc): os dois documentos visiveis, 14 passos, e a caixa de impressao abre sozinha', async () => {
    mockApi(FIXTURE);
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true, writable: true });
    const { container } = abrir('', true);
    await screen.findByText('Script dos 7 passos da venda');
    expect(passosDe(container, 'd1')).toBe(7);
    expect(passosDe(container, 'd2')).toBe(7);
    expect(container.querySelector('section[data-doc="d1"]')!.className).toContain('block');
    expect(container.querySelector('section[data-doc="d2"]')!.className).toContain('block');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() => expect(document.title).toBe('Script-7-passos-Elos-Club'));
  });

  it('sem versao: aviso em vez da folha', async () => {
    (axios.get as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/ficha') return { data: { success: true, data: { club: { slug: 'elos', nome: 'Elos Club' } } } };
      if (url === '/api/script/versoes') return { data: { success: true, versoes: [], job: null } };
      throw new Error('url inesperada ' + url);
    });
    abrir('?doc=campo');
    expect(await screen.findByText('Ainda não existe uma versão do script para imprimir.')).toBeInTheDocument();
  });
});
