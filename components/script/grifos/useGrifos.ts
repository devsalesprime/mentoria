import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { Grifo, GrifoCor, GrifoNovo } from './types';

/**
 * Grifos de uma versao do script: GET /api/script/versoes/:v/grifos (os da versao + os pendentes das anteriores),
 * POST para criar, PATCH (nota, cor) e DELETE (so o autor).
 */
export function useGrifos(token: string, versao: number | null) {
  const [grifos, setGrifos] = useState<Grifo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const recarregar = useCallback(async () => {
    if (versao == null) { setGrifos([]); return; }
    setCarregando(true);
    try {
      const res = await axios.get(`/api/script/versoes/${versao}/grifos`, headers);
      if (res.data?.success) { setGrifos(res.data.grifos || []); setErro(null); }
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Não deu para carregar os grifos.');
    } finally {
      setCarregando(false);
    }
  }, [versao, headers]);

  useEffect(() => { recarregar(); }, [recarregar]);

  const mensagem = (e: any, padrao: string) => e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || padrao;

  const criar = useCallback(async (novo: GrifoNovo): Promise<{ ok: boolean; grifo?: Grifo; message?: string }> => {
    if (versao == null) return { ok: false, message: 'Abra uma versão do script para grifar.' };
    try {
      const res = await axios.post(`/api/script/versoes/${versao}/grifos`, novo, headers);
      if (res.data?.success && res.data.grifo) {
        setGrifos((prev) => [...prev, res.data.grifo]);
        return { ok: true, grifo: res.data.grifo };
      }
      return { ok: false, message: res.data?.message || 'Não deu para salvar o grifo.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para salvar o grifo.') };
    }
  }, [versao, headers]);

  const editar = useCallback(async (id: string, patch: { nota?: string; cor?: GrifoCor }): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await axios.patch(`/api/script/grifos/${id}`, patch, headers);
      if (res.data?.success && res.data.grifo) {
        setGrifos((prev) => prev.map((g) => (g.id === id ? res.data.grifo : g)));
        return { ok: true };
      }
      return { ok: false, message: res.data?.message || 'Não deu para alterar o grifo.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para alterar o grifo.') };
    }
  }, [headers]);

  const apagar = useCallback(async (id: string): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await axios.delete(`/api/script/grifos/${id}`, headers);
      if (res.data?.success) {
        setGrifos((prev) => prev.filter((g) => g.id !== id));
        return { ok: true };
      }
      return { ok: false, message: res.data?.message || 'Não deu para apagar o grifo.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para apagar o grifo.') };
    }
  }, [headers]);

  const pendentes = useMemo(() => grifos.filter((g) => !g.resolvido_em), [grifos]);

  return { grifos, pendentes, carregando, erro, criar, editar, apagar, recarregar, setGrifos };
}

export type UseGrifos = ReturnType<typeof useGrifos>;
