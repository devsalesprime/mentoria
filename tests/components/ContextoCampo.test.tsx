import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

import axios from 'axios';
import { ContextoCampo, MSG_REVISAO, resumoItem, primeiroNome } from '../../components/script/contexto/ContextoCampo';
import { ToastStack } from '../../components/script/contexto/ToastStack';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../data/script-ficha-fields';
import { emailDoToken, itemEhMeu, sugestaoVazia, type CampoComContexto, type ContextoItem } from '../../hooks/useContextoCampo';

const api = axios as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

function tokenDe(email: string) {
  const b64 = (s: string) => btoa(s).replace(/=+$/, '');
  return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify({ userId: 'u1', user: email, role: 'member' }))}.assinatura`;
}

function campo(extra: Partial<CampoComContexto> = {}): CampoComContexto {
  const def = SCRIPT_FIELD_BY_KEY['2.1'];
  return {
    key: '2.1', bloco: 2, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw, obrigatorio: true, minutos: 2,
    opcoes: null, widget: def.widget, template: def.template, sugerido: 'Sou a Paloma.', classe: 'Fato', fonte: 'teste', alternativas: [],
    status: 'sugerido', valor: '', estrutura: null, valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null,
    ...extra,
  } as CampoComContexto;
}

const item = (over: Partial<ContextoItem>): ContextoItem => ({
  id: 'c1', field_key: '2.1', tipo: 'nota', file_id: null, file_name: null, file_type: null, url: null, texto: null, legenda: null,
  transcricao: null, autor_email: 'paloma@ex.com', autor_nome: 'Paloma Silva', created_at: '2026-09-03T10:00:00Z', download_url: null,
  ...over,
});

beforeEach(() => {
  window.localStorage.setItem('memberToken', tokenDe('paloma@ex.com'));
  api.get.mockReset();
  api.post.mockReset();
  api.delete.mockReset();
});

describe('helpers do contexto', () => {
  it('lê o e-mail do JWT e decide o que é meu', () => {
    expect(emailDoToken(tokenDe('Paloma@Ex.com'))).toBe('paloma@ex.com');
    expect(emailDoToken('lixo')).toBe('');
    expect(itemEhMeu(item({ autor_email: 'paloma@ex.com' }), 'paloma@ex.com')).toBe(true);
    expect(itemEhMeu(item({ autor_email: 'joao@ex.com' }), 'paloma@ex.com')).toBe(false);
    expect(itemEhMeu(item({ autor_email: 'joao@ex.com', mine: true }), 'paloma@ex.com')).toBe(true);
    expect(itemEhMeu(item({ autor_email: 'joao@ex.com' }), '')).toBe(true);
  });

  it('resumo pega os 120 primeiros caracteres na ordem transcrição > texto > legenda > url', () => {
    expect(resumoItem(item({ transcricao: 'x'.repeat(200), texto: 'não' }))).toBe(`${'x'.repeat(120)}...`);
    expect(resumoItem(item({ legenda: 'Print da proposta', url: 'https://a.b' }))).toBe('Print da proposta');
    expect(resumoItem(item({ url: 'https://a.b' }))).toBe('https://a.b');
    expect(primeiroNome('Paloma Silva')).toBe('Paloma');
    expect(primeiroNome('', 'joao.pedro@ex.com')).toBe('joao.pedro');
  });

  it('sugestão só com marcador conta como vazia', () => {
    expect(sugestaoVazia('')).toBe(true);
    expect(sugestaoVazia('  a definir ')).toBe(true);
    expect(sugestaoVazia('Nome: a confirmar')).toBe(true);
    expect(sugestaoVazia('???')).toBe(true);
    expect(sugestaoVazia('Sou a Paloma.')).toBe(false);
  });
});

describe('ContextoCampo', () => {
  it('lista os itens existentes como cartões: ícone por tipo, resumo, primeiro nome e excluir só nos meus', async () => {
    api.get.mockResolvedValue({ data: { items: [
      item({ id: 'a1', tipo: 'audio', transcricao: 'x'.repeat(200) }),
      item({ id: 'l1', tipo: 'link', url: 'https://ex.com/doc', texto: 'Proposta atual', autor_email: 'joao@ex.com', autor_nome: 'João Pedro' }),
    ] } });
    render(<ContextoCampo campo={campo({ contexto_count: 2 })} />);
    await waitFor(() => expect(screen.getByTestId('contexto-itens-2.1')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/api/script/context', expect.objectContaining({ params: { field: '2.1' } }));

    const a = screen.getByTestId('contexto-item-a1');
    expect(a.textContent).toContain(`${'x'.repeat(120)}...`);
    expect(within(a).getByText(/Áudio · Paloma/)).toBeInTheDocument();
    expect(within(a).getByRole('button', { name: 'Excluir áudio de Paloma' })).toBeInTheDocument();

    const l = screen.getByTestId('contexto-item-l1');
    expect(within(l).getByRole('link', { name: 'Proposta atual' })).toHaveAttribute('href', 'https://ex.com/doc');
    expect(within(l).getByText(/Link · João/)).toBeInTheDocument();
    expect(within(l).queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument();
    expect(screen.getByText('Adicionar contexto · 2')).toBeInTheDocument();
  });

  it('"Usar como resposta": a nota escrita vai para o campo sem virar contexto; a transcrição de um áudio da lista também', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ id: 'a1', tipo: 'audio', transcricao: 'Sou a Paloma e ajudo indústrias familiares.' }), item({ id: 'l1', tipo: 'link', url: 'https://ex.com' })] } });
    const onUsarTexto = vi.fn();
    render(<ContextoCampo campo={campo({ contexto_count: 2 })} onUsarTexto={onUsarTexto} />);
    await waitFor(() => expect(screen.getByTestId('contexto-itens-2.1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    const painel = () => within(screen.getByTestId('contexto-painel-nota'));
    expect(painel().getByRole('button', { name: 'Usar como resposta' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Vendo só por indicação.' } });
    fireEvent.click(painel().getByRole('button', { name: 'Usar como resposta' }));
    expect(onUsarTexto).toHaveBeenCalledWith('Vendo só por indicação.');
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('contexto-painel-nota')).not.toBeInTheDocument();
    // na lista: só o áudio com transcrição oferece o atalho (o link não)
    const a = screen.getByTestId('contexto-item-a1');
    fireEvent.click(within(a).getByRole('button', { name: 'Usar como resposta' }));
    expect(onUsarTexto).toHaveBeenLastCalledWith('Sou a Paloma e ajudo indústrias familiares.');
    expect(within(screen.getByTestId('contexto-item-l1')).queryByRole('button', { name: 'Usar como resposta' })).not.toBeInTheDocument();
  });

  it('sem onUsarTexto o atalho não aparece', () => {
    render(<ContextoCampo campo={campo()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    expect(screen.queryByRole('button', { name: 'Usar como resposta' })).not.toBeInTheDocument();
  });

  it('sem contexto: não busca a lista ao montar, mostra as 5 ações e esconde "Pedir sugestão"', () => {
    render(<ContextoCampo campo={campo()} />);
    expect(api.get).not.toHaveBeenCalled();
    for (const r of ['Gravar áudio', 'Foto ou imagem', 'Vídeo', 'Link', 'Nota']) {
      expect(screen.getByRole('button', { name: r })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Pedir sugestão com esse contexto' })).not.toBeInTheDocument();
  });

  it('Nota: salva por multipart com field_key, tipo e texto; o item entra na lista e o botão de pedir aparece', async () => {
    api.get.mockResolvedValue({ data: { items: [] } });
    api.post.mockResolvedValue({ data: { item: item({ id: 'n1', tipo: 'nota', texto: 'Vendo só por indicação.' }) } });
    render(<ContextoCampo campo={campo()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Vendo só por indicação.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(screen.getByTestId('contexto-item-n1')).toBeInTheDocument());

    const [url, fd, cfg] = api.post.mock.calls[0];
    expect(url).toBe('/api/script/context');
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('field_key')).toBe('2.1');
    expect((fd as FormData).get('tipo')).toBe('nota');
    expect((fd as FormData).get('texto')).toBe('Vendo só por indicação.');
    expect(cfg.headers.Authorization).toMatch(/^Bearer /);
    expect(screen.getByText('Vendo só por indicação.')).toBeInTheDocument();
    expect(screen.getByText('Nota salvo. Quando terminar, peça a sugestão.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' })).toBeEnabled();
  });

  it('Link: manda url com esquema e o rótulo como texto', async () => {
    api.post.mockResolvedValue({ data: { item: item({ id: 'l2', tipo: 'link', url: 'https://drive.google.com/x', texto: 'Apostila' }) } });
    render(<ContextoCampo campo={campo()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Endereço do link'), { target: { value: 'drive.google.com/x' } });
    fireEvent.change(screen.getByLabelText('Rótulo do link'), { target: { value: 'Apostila' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const fd = api.post.mock.calls[0][1] as FormData;
    expect(fd.get('tipo')).toBe('link');
    expect(fd.get('url')).toBe('https://drive.google.com/x');
    expect(fd.get('texto')).toBe('Apostila');
  });

  it('Pedir sugestão: POST refinar, recarrega a ficha, aviso na tela e selo "Em revisão pela IA"; o botão trava enquanto revisa', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ id: 'n1', texto: 'nota' })] } });
    api.post.mockResolvedValue({ data: { job: { id: 'j1', status: 'queued' } } });
    const onRecarregar = vi.fn().mockResolvedValue(undefined);
    const ui = (refinando?: boolean) => (
      <>
        <ContextoCampo campo={campo({ contexto_count: 1, refinando })} onRecarregar={onRecarregar} />
        <ToastStack />
      </>
    );
    const { rerender } = render(ui());
    // espera a lista carregar (o mock do framer-motion remonta o botão a cada render: consultar na hora do clique)
    await screen.findByTestId('contexto-item-n1');
    expect(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' })).toBeEnabled();
    expect(screen.queryByTestId('badge-refinando')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/script/ficha/refinar', { field_key: '2.1' }, expect.anything()));
    await waitFor(() => expect(onRecarregar).toHaveBeenCalled());
    expect(await screen.findByText(MSG_REVISAO)).toBeInTheDocument();
    expect(screen.getAllByTestId('badge-refinando').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' })).toBeDisabled();

    // o servidor confirma "refinando": continua travado e com o selo
    rerender(ui(true));
    expect(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' })).toBeDisabled();
    expect(screen.getAllByTestId('badge-refinando').length).toBeGreaterThan(0);

    // a revisão terminou: libera
    rerender(ui(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pedir sugestão com esse contexto' })).toBeEnabled());
  });

  it('excluir chama DELETE e tira o cartão', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ id: 'n9', texto: 'apagar' })] } });
    api.delete.mockResolvedValue({ data: { success: true } });
    render(<ContextoCampo campo={campo({ contexto_count: 1 })} />);
    const card = await screen.findByTestId('contexto-item-n9');
    fireEvent.click(within(card).getByRole('button', { name: /Excluir nota/ }));
    await waitFor(() => expect(screen.queryByTestId('contexto-item-n9')).not.toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledWith('/api/script/context/n9', expect.anything());
  });

  it('vídeo acima de 50 MB é barrado no navegador e sugere link', () => {
    render(<ContextoCampo campo={campo()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vídeo' }));
    const grande = new File(['x'], 'grande.mp4', { type: 'video/mp4' });
    Object.defineProperty(grande, 'size', { value: 51 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Arquivo de vídeo'), { target: { files: [grande] } });
    expect(screen.getByRole('alert')).toHaveTextContent('O vídeo passa de 50 MB');
    expect(screen.getByRole('button', { name: 'Enviar vídeo' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('nenhum texto visível usa travessão nem a palavra diagnóstico', async () => {
    api.get.mockResolvedValue({ data: { items: [item({ id: 'n1', texto: 'nota' })] } });
    const { container } = render(<ContextoCampo campo={campo({ contexto_count: 1, refinando: true })} />);
    await screen.findByTestId('contexto-item-n1');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(container.textContent).not.toContain('—');
    expect(container.textContent!.toLowerCase()).not.toContain('diagnóstico');
  });
});
