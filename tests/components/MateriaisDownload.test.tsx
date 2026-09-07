import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Baixar o proprio arquivo na tela Materiais.
 *
 * O mentor subia a transcricao e nao tinha como conferir o que tinha mandado: a lista so mostrava o
 * nome e o botao de remover. Agora cada linha ganha o icone de baixar, apontando para
 * GET /api/script/materials/files/:id/download, que o servidor so entrega a quem enviou (o socio do
 * mesmo clube recebe 404; ver tests/routes/scriptMaterials.test.ts).
 *
 * O botao e opcional no FileUpload: sem a prop `downloadUrl` nada muda nas telas antigas.
 */

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

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, prompt: '' } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { MateriaisScreen } from '../../components/script/MateriaisScreen';
import { FileUpload } from '../../components/shared/FileUpload';
import { MATERIAL_CATEGORIAS } from '../../components/script/materiais/categorias';
import type { ScriptFichaData, UseScriptFicha } from '../../hooks/useScriptFicha';

/** A primeira categoria ja nasce aberta na tela, entao o arquivo dela aparece sem clique. */
const PRIMEIRA = MATERIAL_CATEGORIAS[0].id;

const arquivo = {
  id: 'file a/1',
  userId: 'userA',
  category: PRIMEIRA,
  fileName: 'reunião com o cliente.txt',
  fileType: 'text/plain',
  fileSize: 1234,
  createdAt: '2026-09-05 10:00:00',
  mine: true,
};

function dados(): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'vazia',
    modo: 'essencial',
    suficiencia: null,
    materials_status: 'pending', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' }, prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [arquivo], dias: [], blocos: [], job: null,
    hoje: { dia: 1, titulo: '', blocos: [], blocos_abertos: [], minutos: 0, em_breve: false },
    progresso: { total: 0, decididos: 0, obrigatorios: 0, obrigatorios_decididos: 0, confirmados: 0, editados: 0, aceitos_vazios: 0 },
  } as ScriptFichaData;
}

const carregada = (): UseScriptFicha => ({
  data: dados(), loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
  saveMaterials: vi.fn().mockResolvedValue(true),
  submitMaterials: vi.fn().mockResolvedValue({ ok: true }),
  pularMateriais: vi.fn().mockResolvedValue({ ok: true }),
  setFiles: vi.fn(), refreshFiles: vi.fn(),
} as unknown as UseScriptFicha);

describe('Materiais: baixar o proprio arquivo', () => {
  it('cada arquivo da lista tem o link de baixar, com o id e o token na URL', async () => {
    render(
      <MemoryRouter>
        <MateriaisScreen ficha={carregada()} token="tok en" onNavigate={vi.fn()} />
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: 'Baixar reunião com o cliente.txt' });
    expect(link).toHaveAttribute('href', '/api/script/materials/files/file%20a%2F1/download?token=tok%20en');
    expect(link).toHaveAttribute('download', 'reunião com o cliente.txt');
    // o icone e SVG, nunca emoji
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.textContent).toBe('');
  });

  it('sem a prop downloadUrl nao aparece link nenhum (telas antigas seguem iguais)', () => {
    render(
      <FileUpload
        files={[{ id: 'f1', userId: 'userA', category: 'materials', fileName: 'antigo.pdf', filePath: '' } as any]}
        onFilesChange={vi.fn()}
        category="materials"
        token="tok"
      />,
    );

    expect(screen.getByText('antigo.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Baixar/ })).toBeNull();
  });
});
