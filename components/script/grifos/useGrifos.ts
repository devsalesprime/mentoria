import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { AnexoPendente, Grifo, GrifoAnexo, GrifoCor, GrifoNovo } from './types';

/** FormData de um anexo (arquivo vai por multipart; link e nota vão nos mesmos campos). */
export function formDataDoAnexo(novo: AnexoPendente): FormData {
  const fd = new FormData();
  fd.append('tipo', novo.tipo);
  if (novo.file) fd.append('file', novo.file, novo.fileName || (novo.file as File).name || `${novo.tipo}-${Date.now()}`);
  if (novo.url) fd.append('url', novo.url.trim());
  if (novo.texto) fd.append('texto', novo.texto.trim());
  if (novo.legenda) fd.append('legenda', novo.legenda.trim());
  return fd;
}

/**
 * Grifos de uma versao do script: GET /api/script/versoes/:v/grifos (os da versao + os pendentes das anteriores),
 * POST para criar, PATCH (nota, cor) e DELETE (so o autor).
 * Anexos do grifo (onda E3): POST /api/script/grifos/:id/contexto e DELETE .../contexto/:itemId: a mesma
 * mecanica do contexto por pergunta da Ficha (audio transcrito pela Groq no envio).
 */
export function useGrifos(token: string, versao: number | null) {
  const [grifos, setGrifos] = useState<Grifo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  /** Id do último grifo criado: o balão anexa nele logo depois de salvar, sem esperar o re-render. */
  const ultimoCriado = useRef<string | null>(null);

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
        ultimoCriado.current = res.data.grifo.id;
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

  /** Anexa um material a um grifo já salvo e devolve o item (com a transcrição, quando é áudio). */
  const anexar = useCallback(async (grifoId: string, novo: AnexoPendente): Promise<{ ok: boolean; item?: GrifoAnexo; warning?: string; message?: string }> => {
    try {
      const res = await axios.post(`/api/script/grifos/${grifoId}/contexto`, formDataDoAnexo(novo), { ...headers, timeout: 120000 });
      const item: GrifoAnexo | undefined = res.data?.item;
      if (res.data?.success && item) {
        setGrifos((prev) => prev.map((g) => (g.id === grifoId ? { ...g, contexto: [...(g.contexto || []).filter((x) => x.id !== item.id), item] } : g)));
        return { ok: true, item, warning: res.data?.warning };
      }
      return { ok: false, message: res.data?.message || 'Não deu para anexar o material.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para anexar o material.') };
    }
  }, [headers]);

  /** Anexa no grifo recém-criado (o balão salva o grifo e só depois manda o que estava na fila). */
  const anexarNoUltimo = useCallback(async (pendentes: AnexoPendente[]): Promise<{ ok: boolean; message?: string }> => {
    const id = ultimoCriado.current;
    if (!id) return { ok: false, message: 'Salve o grifo antes de anexar.' };
    for (const novo of pendentes) {
      const r = await anexar(id, novo);
      if (!r.ok) return r;
    }
    return { ok: true };
  }, [anexar]);

  const removerAnexo = useCallback(async (grifoId: string, itemId: string): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await axios.delete(`/api/script/grifos/${grifoId}/contexto/${itemId}`, headers);
      if (res.data?.success) {
        setGrifos((prev) => prev.map((g) => (g.id === grifoId ? { ...g, contexto: (g.contexto || []).filter((x) => x.id !== itemId) } : g)));
        return { ok: true };
      }
      return { ok: false, message: res.data?.message || 'Não deu para apagar o anexo.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para apagar o anexo.') };
    }
  }, [headers]);

  const pendentes = useMemo(() => grifos.filter((g) => !g.resolvido_em), [grifos]);

  return { grifos, pendentes, carregando, erro, criar, editar, apagar, anexar, anexarNoUltimo, removerAnexo, recarregar, setGrifos };
}

export type UseGrifos = ReturnType<typeof useGrifos>;
