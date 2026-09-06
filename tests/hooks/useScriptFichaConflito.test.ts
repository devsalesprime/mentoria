/**
 * Escrita concorrente de sócios no hook (hooks/useScriptFicha.ts):
 * - toda decisão sai com a `rev` que esta tela viu
 * - o 409 do servidor não vira erro de salvamento: o campo recebe a resposta do sócio e entra em `conflitos`
 * - "Manter a resposta dele" só limpa o aviso; "Usar a minha" reenvia a MESMA decisão com `forcar: true`
 *   e a `rev` nova (o que o servidor exige para gravar por cima)
 * - a fila não retenta sozinha o campo disputado (nada de sobrescrever o sócio em silêncio)
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useScriptFicha } from '../../hooks/useScriptFicha';
import { SCRIPT_BLOCKS, SCRIPT_FIELD_BY_KEY, type ScriptBlockView, type ScriptFieldView } from '../../data/script-ficha-fields';

vi.mock('axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));

const EU = 'ana@x.com';
const SOCIO = { email: 'gu@x.com', nome: 'Gustavo Prado' };

function campoDe(key: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key, bloco: def.bloco, nome: def.nome, pergunta: def.pergunta, tipo: def.tipo, tipoRaw: def.tipoRaw,
    obrigatorio: def.obrigatorio, minutos: def.minutos, opcoes: def.opcoes ?? null, widget: def.widget, template: def.template,
    sugerido: '', classe: 'VZ', fonte: '', alternativas: [], status: 'vazio', valor: '', estrutura: null,
    valor_efetivo: '', decidido: false, atualizado_por: null, atualizado_em: null, rev: 1, decidido_por: null,
    ...extra,
  };
}

function bloco(campos: ScriptFieldView[]): ScriptBlockView {
  const def = SCRIPT_BLOCKS.find((b) => b.numero === 3)!;
  return {
    numero: 3, nome: def.nome, descricao: def.descricao, total: campos.length, decididos: 0,
    obrigatorios: campos.filter((c) => c.obrigatorio).length, obrigatorios_decididos: 0,
    minutos: 10, minutos_pendentes: 10, fechado: false, campos,
  };
}

const ficha = () => ({
  club: { slug: 'clube-socios', nome: 'Ana e Gustavo' },
  ficha_status: 'pre_preenchida',
  materials_status: 'submitted',
  materials_submitted_at: null,
  materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
  config: { prazo_materiais: '' },
  prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
  categorias: [], files: [], dias: [], job: null,
  blocos: [bloco([campoDe('3.3'), campoDe('3.4')])],
  progresso: { total: 2, decididos: 0, obrigatorios: 2, obrigatorios_decididos: 0, confirmados: 0, editados: 0, aceitos_vazios: 0 },
  hoje: { dia: 1, titulo: 'Hoje', blocos: [3], blocos_abertos: [3], minutos: 10, em_breve: false },
});

const conflito409 = {
  response: {
    status: 409,
    data: {
      success: false,
      applied: [],
      revs: {},
      message: 'O seu sócio respondeu este campo antes de você.',
      conflitos: [{
        field_key: '3.3',
        rev: 4,
        status: 'editado',
        valor: 'A dor, pelo Gustavo',
        valor_efetivo: 'A dor, pelo Gustavo',
        sugerido: '',
        decidido_por: SOCIO,
        atualizado_em: '2026-09-06 18:00:00',
      }],
    },
  },
};

async function montar() {
  (axios.get as any).mockResolvedValue({ data: { success: true, data: ficha() } });
  const hook = renderHook(() => useScriptFicha('token', true, EU));
  await waitFor(() => expect(hook.result.current.data).toBeTruthy());
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('a decisão leva a versão do campo', () => {
  it('o PUT sai com a `rev` que a tela viu', async () => {
    const { result } = await montar();
    (axios.put as any).mockResolvedValue({ data: { success: true, applied: ['3.3'], revs: { '3.3': 2 }, blocos: [] } });
    await act(async () => {
      result.current.decide('3.3', { status: 'editado', valor: 'A minha resposta' });
      await result.current.flush();
    });
    expect((axios.put as any).mock.calls[0][1]).toEqual({
      updates: { '3.3': { status: 'editado', valor: 'A minha resposta', rev: 1 } },
    });
    // a versão devolvida pelo servidor entra no campo para o próximo salvamento
    const campo = result.current.data!.blocos[0].campos.find((c) => c.key === '3.3')!;
    expect(campo.rev).toBe(2);
  });
});

describe('o 409 do sócio', () => {
  it('não vira erro: o campo mostra a resposta dele e o aviso entra em `conflitos`', async () => {
    const { result } = await montar();
    (axios.put as any).mockRejectedValue(conflito409);
    await act(async () => {
      result.current.decide('3.3', { status: 'editado', valor: 'A minha resposta' });
      await result.current.flush();
    });
    expect(result.current.saveState).not.toBe('error');
    const conf = result.current.conflitos['3.3'];
    expect(conf.decidido_por).toEqual(SOCIO);
    expect(conf.valor_efetivo).toBe('A dor, pelo Gustavo');
    expect(conf.minha).toEqual({ status: 'editado', valor: 'A minha resposta', rev: 1 });
    // o campo passa a mostrar o que o sócio decidiu, com a versão nova
    const campo = result.current.data!.blocos[0].campos.find((c) => c.key === '3.3')!;
    expect(campo.valor_efetivo).toBe('A dor, pelo Gustavo');
    expect(campo.decidido).toBe(true);
    expect(campo.rev).toBe(4);
    expect(campo.decidido_por).toEqual(SOCIO);
  });

  it('"Manter a resposta dele" só tira o aviso, sem novo salvamento', async () => {
    const { result } = await montar();
    (axios.put as any).mockRejectedValue(conflito409);
    await act(async () => {
      result.current.decide('3.3', { status: 'editado', valor: 'A minha resposta' });
      await result.current.flush();
    });
    const chamadas = (axios.put as any).mock.calls.length;
    act(() => result.current.manterDoSocio('3.3'));
    expect(result.current.conflitos['3.3']).toBeUndefined();
    await act(async () => { await result.current.flush(); });
    expect((axios.put as any).mock.calls.length).toBe(chamadas);
  });

  it('"Usar a minha" reenvia a mesma decisão com `forcar: true` e a versão nova', async () => {
    const { result } = await montar();
    (axios.put as any).mockRejectedValue(conflito409);
    await act(async () => {
      result.current.decide('3.3', { status: 'editado', valor: 'A minha resposta' });
      await result.current.flush();
    });
    (axios.put as any).mockResolvedValue({ data: { success: true, applied: ['3.3'], revs: { '3.3': 5 }, blocos: [] } });
    await act(async () => {
      result.current.usarAMinha('3.3');
      await result.current.flush();
    });
    const ultima = (axios.put as any).mock.calls.at(-1)[1];
    expect(ultima).toEqual({
      updates: { '3.3': { status: 'editado', valor: 'A minha resposta', rev: 4, forcar: true } },
    });
    expect(result.current.conflitos['3.3']).toBeUndefined();
    const campo = result.current.data!.blocos[0].campos.find((c) => c.key === '3.3')!;
    expect(campo.valor_efetivo).toBe('A minha resposta');
  });
});
