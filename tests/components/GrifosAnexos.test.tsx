import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { GrifosPanel } from '../../components/script/grifos/GrifosPanel';
import { GrifoBubble } from '../../components/script/grifos/GrifoBubble';
import type { Captura } from '../../components/script/grifos/anchor';
import type { Grifo, GrifoAnexo } from '../../components/script/grifos/types';

/**
 * Onda E3 (anexos do grifo):
 * - cartão de "Seus grifos": linha "Anexar" com os 5 botões, chips do que já veio do servidor, anexar nota
 *   (POST) e remover só o que a própria pessoa anexou (DELETE)
 * - balão de criação: a fila local vira chip, dá para tirar, e ao salvar o grifo a fila sobe pelo `anexar`
 */
vi.mock('axios');

const ANEXO_AUDIO: GrifoAnexo = {
  id: 'ctx-1', tipo: 'audio', transcricao: 'Fala do preço antes de mostrar a proposta.',
  autor_email: 'a@x.com', autor_nome: 'Ana', file_name: 'voz.webm', download_url: '/api/script/context/files/f1/download',
};
const ANEXO_LINK: GrifoAnexo = { id: 'ctx-2', tipo: 'link', url: 'https://drive.google.com/reuniao', texto: 'gravação da call', autor_email: 'b@x.com', autor_nome: 'Beto' };

const GRIFO: Grifo = {
  id: 'sg-1', versao: 1, passo: 2, documento: 'treinamento',
  texto: 'Prazer, eu sou o Rafael, do time da Paloma.', prefixo: '', sufixo: '',
  cor: 'dourado', nota: 'dizer o nome dele antes', autor_email: 'a@x.com', autor_nome: 'Ana',
  created_at: '2026-09-06 10:00:00', resolvido_em: null,
  contexto: [ANEXO_AUDIO, ANEXO_LINK],
};

function painel(g: Grifo = GRIFO) {
  return render(
    <GrifosPanel
      grifos={[g]}
      encontrado={() => true}
      meuEmail="a@x.com"
      nomeDoPasso={() => 'Conexão'}
      onIrPara={vi.fn()}
      onEditarNota={vi.fn(async () => true)}
      onApagar={vi.fn(async () => true)}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('memberToken', 'token-de-teste');
});

describe('GrifosPanel: anexos no cartão do grifo', () => {
  it('mostra os chips do que já foi anexado e a linha "Anexar" com os 5 botões', () => {
    painel();
    const cartao = screen.getByTestId('grifo-item');
    expect(within(cartao).getByTestId('grifo-anexos-sg-1')).toBeInTheDocument();
    expect(within(cartao).getByTestId('grifo-anexo-ctx-1')).toHaveTextContent('Fala do preço antes de mostrar a proposta.');
    expect(within(cartao).getByTestId('grifo-anexo-ctx-2')).toHaveTextContent('gravação da call');
    for (const rotulo of ['Gravar áudio', 'Enviar foto', 'Enviar vídeo', 'Colar link', 'Escrever nota']) {
      expect(within(cartao).getByRole('button', { name: rotulo })).toBeInTheDocument();
    }
    // a lixeira aparece só no que eu anexei
    expect(within(cartao).getByRole('button', { name: 'Remover áudio anexado' })).toBeInTheDocument();
    expect(within(cartao).queryByRole('button', { name: 'Remover link anexado' })).toBeNull();
  });

  it('anexa uma nota pelo POST e o chip novo entra na lista', async () => {
    const novo: GrifoAnexo = { id: 'ctx-3', tipo: 'nota', texto: 'usar o nome do cliente na abertura', autor_email: 'a@x.com', autor_nome: 'Ana' };
    (axios.post as any).mockResolvedValue({ data: { success: true, grifo_id: 'sg-1', item: novo } });
    painel();
    fireEvent.click(screen.getByRole('button', { name: 'Escrever nota' }));
    fireEvent.change(screen.getByLabelText('Nota do anexo'), { target: { value: 'usar o nome do cliente na abertura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar nota' }));
    await waitFor(() => expect(screen.getByTestId('grifo-anexo-ctx-3')).toHaveTextContent('usar o nome do cliente na abertura'));
    expect(axios.post).toHaveBeenCalledWith('/api/script/grifos/sg-1/contexto', expect.any(FormData), expect.objectContaining({ timeout: 120000 }));
    const fd = (axios.post as any).mock.calls[0][1] as FormData;
    expect(fd.get('tipo')).toBe('nota');
    expect(fd.get('texto')).toBe('usar o nome do cliente na abertura');
  });

  it('remover chama o DELETE e o chip some', async () => {
    (axios.delete as any).mockResolvedValue({ data: { success: true, id: 'ctx-1' } });
    painel();
    fireEvent.click(screen.getByRole('button', { name: 'Remover áudio anexado' }));
    await waitFor(() => expect(screen.queryByTestId('grifo-anexo-ctx-1')).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith('/api/script/grifos/sg-1/contexto/ctx-1', expect.anything());
    expect(screen.getByTestId('grifo-anexo-ctx-2')).toBeInTheDocument();
  });

  it('grifo já atendido mostra os anexos só de leitura', () => {
    painel({ ...GRIFO, resolvido_em: '2026-09-06 12:00:00' });
    const cartao = screen.getByTestId('grifo-item');
    expect(within(cartao).getByTestId('grifo-anexo-ctx-1')).toBeInTheDocument();
    expect(within(cartao).queryByRole('button', { name: 'Escrever nota' })).toBeNull();
    expect(within(cartao).queryByRole('button', { name: 'Remover áudio anexado' })).toBeNull();
  });
});

const CAPTURA: Captura = {
  texto: 'Prazer, eu sou o Rafael, do time da Paloma.',
  prefixo: 'Fala 1', sufixo: 'Diga o nome', tela: 2, documento: 'treinamento',
  rect: { top: 100, left: 20, bottom: 130, right: 300, width: 280, height: 30 },
  curto: false, longo: false,
};

describe('GrifoBubble: fila de anexos antes de o grifo existir', () => {
  it('a nota da fila vira chip, dá para tirar, e ao salvar o grifo a fila sobe', async () => {
    const onSalvar = vi.fn(async () => true);
    const anexar = vi.fn(async () => ({ ok: true }));
    render(<GrifoBubble captura={CAPTURA} onSalvar={onSalvar} onCancelar={vi.fn()} anexar={anexar} />);

    // a linha "Anexar" só aparece depois da cor
    expect(screen.queryByTestId('grifo-anexar-balao')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }));
    expect(screen.getByTestId('grifo-anexar-balao')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Escrever nota' }));
    fireEvent.change(screen.getByLabelText('Nota do anexo'), { target: { value: 'a promessa aqui está genérica' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar nota' }));
    const chips = await screen.findByTestId('grifo-anexos-balao');
    expect(chips).toHaveTextContent('a promessa aqui está genérica');

    // tirar da fila
    fireEvent.click(screen.getByRole('button', { name: 'Remover nota anexado' }));
    await waitFor(() => expect(screen.queryByTestId('grifo-anexos-balao')).toBeNull());

    // colocar de novo e salvar: o grifo grava primeiro, a fila sobe depois
    fireEvent.click(screen.getByRole('button', { name: 'Escrever nota' }));
    fireEvent.change(screen.getByLabelText('Nota do anexo'), { target: { value: 'a promessa aqui está genérica' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar nota' }));
    await screen.findByTestId('grifo-anexos-balao');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar grifo' }));
    await waitFor(() => expect(anexar).toHaveBeenCalledWith([{ tipo: 'nota', texto: 'a promessa aqui está genérica' }]));
    expect(onSalvar).toHaveBeenCalledWith('dourado', '');
  });

  it('sem `anexar` o balão continua o de antes (nenhuma linha nova)', () => {
    render(<GrifoBubble captura={CAPTURA} onSalvar={vi.fn(async () => true)} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }));
    expect(screen.queryByTestId('grifo-anexar-balao')).toBeNull();
    expect(screen.getByRole('button', { name: 'Salvar grifo' })).toBeInTheDocument();
  });
});
