/**
 * "Editar e incorporar" do complemento: o mentor lapida o achado do worker ANTES de ele entrar no texto
 * (SPEC-workflow-v4 item 5). Fala com a mesma rota do incorporar direto, so que levando `texto`.
 * O servidor sempre ACRESCENTA ao valor atual (separador de linha em branco); nunca substitui.
 * Vive fora de useScriptFicha para nao mexer no hook: quem chama recarrega a ficha depois.
 */
import axios from 'axios';
import type { ScriptFieldView } from '../data/script-ficha-fields';

export interface IncorporarTextoResultado {
  ok: boolean;
  campo?: ScriptFieldView;
  ficha_status?: string;
  message?: string;
}

/** Limite do servidor para o texto editado (z.string().min(1).max(4000)). */
export const COMPLEMENTO_TEXTO_MAX = 4000;

export async function incorporarComplementoEditado(
  token: string,
  key: string,
  texto: string,
): Promise<IncorporarTextoResultado> {
  const limpo = (texto || '').trim().slice(0, COMPLEMENTO_TEXTO_MAX);
  if (!limpo) return { ok: false, message: 'Escreva o texto antes de incorporar.' };
  if (!token) return { ok: false, message: 'Indisponível agora.' };
  try {
    const res = await axios.post(
      `/api/script/ficha/fields/${encodeURIComponent(key)}/complemento`,
      { acao: 'incorporar', texto: limpo },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.data?.success && res.data.campo) {
      return { ok: true, campo: res.data.campo as ScriptFieldView, ficha_status: res.data.ficha_status };
    }
    return { ok: false, message: res.data?.message };
  } catch (e: any) {
    return { ok: false, message: e?.response?.data?.message || e?.message };
  }
}
