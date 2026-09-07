/**
 * Anexos de UM grifo já salvo, para o cartão de "Seus grifos".
 * O token sai do localStorage (`memberToken`), igual ao contexto por pergunta da Ficha: assim o painel anexa
 * sem depender de props novas de quem o monta. Quem tiver o hook de rede em mãos pode passar `onEnviar`/`onRemover`
 * (é o que os testes fazem) e o hook usa esses no lugar do axios.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { memberToken } from '../../../hooks/useContextoCampo';
import { formDataDoAnexo } from './useGrifos';
import type { AnexoPendente, Grifo, GrifoAnexo } from './types';

type Resultado = { ok: boolean; message?: string; item?: GrifoAnexo };

function mensagem(e: any, padrao: string): string {
  const errs = e?.response?.data?.errors;
  return e?.response?.data?.message || (Array.isArray(errs) ? errs.join('; ') : '') || padrao;
}

export interface AnexosGrifoOverrides {
  onEnviar?: (novo: AnexoPendente) => Promise<Resultado>;
  onRemover?: (itemId: string) => Promise<Resultado>;
}

export function useAnexosGrifo(g: Grifo, overrides: AnexosGrifoOverrides = {}) {
  const [itens, setItens] = useState<GrifoAnexo[]>(g.contexto || []);
  const doServidor = g.contexto;
  // A lista do servidor manda: quando o GET da versão traz outra, ela substitui a local
  useEffect(() => { if (doServidor) setItens(doServidor); }, [doServidor]);

  const enviar = useCallback(async (novo: AnexoPendente): Promise<Resultado> => {
    if (overrides.onEnviar) {
      const r = await overrides.onEnviar(novo);
      if (r.ok && r.item) { const item = r.item; setItens((prev) => [...prev.filter((x) => x.id !== item.id), item]); }
      return r;
    }
    const token = memberToken();
    if (!token) return { ok: false, message: 'Sessão expirada. Entre de novo.' };
    try {
      const res = await axios.post(`/api/script/grifos/${g.id}/contexto`, formDataDoAnexo(novo), {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000,
      });
      const item: GrifoAnexo | undefined = res.data?.item;
      if (res.data?.success && item) {
        setItens((prev) => [...prev.filter((x) => x.id !== item.id), item]);
        return { ok: true, message: res.data?.warning };
      }
      return { ok: false, message: res.data?.message || 'Não deu para anexar o material.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para anexar o material.') };
    }
  }, [g.id, overrides]);

  const remover = useCallback(async (itemId: string): Promise<Resultado> => {
    if (overrides.onRemover) {
      const r = await overrides.onRemover(itemId);
      if (r.ok) setItens((prev) => prev.filter((x) => x.id !== itemId));
      return r;
    }
    const token = memberToken();
    if (!token) return { ok: false, message: 'Sessão expirada. Entre de novo.' };
    try {
      const res = await axios.delete(`/api/script/grifos/${g.id}/contexto/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) {
        setItens((prev) => prev.filter((x) => x.id !== itemId));
        return { ok: true };
      }
      return { ok: false, message: res.data?.message || 'Não deu para apagar o anexo.' };
    } catch (e: any) {
      return { ok: false, message: mensagem(e, 'Não deu para apagar o anexo.') };
    }
  }, [g.id, overrides]);

  return { itens, enviar, remover };
}
