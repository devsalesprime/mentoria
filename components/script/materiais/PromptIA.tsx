import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import type { MaterialRespostaIA } from '../../../hooks/useScriptFicha';
import { Button } from '../../ui/Button';
import { PROMPT_IA_INTRO } from './categorias';

interface PromptIAProps {
  token: string;
  /** Resposta ja salva desta pessoa (ou null). */
  resposta?: MaterialRespostaIA | null;
  /** Salva o texto colado (PUT /api/script/ficha/materials { resposta_ia }). Devolve false se falhou. */
  onSave: (texto: string) => Promise<boolean>;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Copia para a area de transferencia: navigator.clipboard com fallback (textarea + execCommand). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cai no fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * Secao "Peca para a sua IA preencher": prompt gerado por clube (GET /api/script/prompt-ia),
 * botao Copiar, "Ver prompt" colapsavel e a caixa para colar a resposta da IA.
 */
export const PromptIA: React.FC<PromptIAProps> = ({ token, resposta, onSave }) => {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [texto, setTexto] = useState<string>(resposta?.texto || '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    axios.get('/api/script/prompt-ia', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (alive && res.data?.success) setPrompt(res.data.prompt || ''); })
      .catch((e: any) => { if (alive) setPromptError(e?.response?.data?.message || 'Não deu para carregar o prompt agora.'); });
    return () => { alive = false; };
  }, [token]);

  // Se a resposta salva mudou (ex.: carregou depois) e a pessoa ainda nao digitou, espelha
  useEffect(() => {
    if (!editedRef.current && resposta?.texto) setTexto(resposta.texto);
  }, [resposta?.texto]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const handleCopy = async () => {
    if (!prompt) return;
    const ok = await copyText(prompt);
    setCopyState(ok ? 'copied' : 'error');
    if (!ok) setShowPrompt(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const ok = await onSave(texto);
    setSaving(false);
    setSaveMsg(ok ? 'Resposta salva.' : 'Não deu para salvar agora. Tente de novo.');
    if (ok) editedRef.current = false;
  };

  const dirty = texto !== (resposta?.texto || '');

  return (
    <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
      <h3 className="font-serif text-xl text-white">Peça para a sua IA preencher</h3>
      <p className="text-sm text-white/60 font-sans leading-relaxed">{PROMPT_IA_INTRO}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="lg"
          className="min-h-[44px]"
          onClick={handleCopy}
          disabled={!prompt}
          aria-live="polite"
        >
          {copyState === 'copied' ? 'Prompt copiado' : copyState === 'error' ? 'Copie manualmente abaixo' : 'Copiar prompt'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="min-h-[44px]"
          onClick={() => setShowPrompt((v) => !v)}
          disabled={!prompt}
          aria-expanded={showPrompt}
        >
          {showPrompt ? 'Esconder prompt' : 'Ver prompt'}
        </Button>
      </div>
      {promptError && <p className="text-xs text-red-400 font-sans">{promptError}</p>}
      {!prompt && !promptError && <p className="text-xs text-white/40 font-sans">Montando o prompt da sua mentoria...</p>}

      {showPrompt && prompt && (
        <textarea
          readOnly
          value={prompt}
          rows={14}
          aria-label="Prompt para a sua IA"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full bg-prosperus-navy-mid border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 font-mono outline-none resize-y leading-relaxed"
        />
      )}

      <div className="space-y-2 pt-1">
        <label htmlFor="resposta-ia" className="block text-sm text-white/80 font-sans">Cole aqui a resposta da sua IA</label>
        <textarea
          id="resposta-ia"
          value={texto}
          onChange={(e) => { editedRef.current = true; setTexto(e.target.value); setSaveMsg(null); }}
          rows={8}
          placeholder="### 1.1 [CERTO]&#10;..."
          className="w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 font-mono outline-none resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="min-h-[44px]"
            onClick={handleSave}
            disabled={saving || !dirty || (!texto.trim() && !resposta?.texto)}
            loading={saving}
          >
            Salvar resposta
          </Button>
          {saveMsg && (
            <span className={`text-xs font-sans ${saveMsg.startsWith('Resposta salva') ? 'text-green-400' : 'text-red-400'}`}>{saveMsg}</span>
          )}
        </div>
        {resposta?.texto && (
          <p className="text-xs text-white/50 font-sans">
            {resposta.resumo || 'Resposta salva'}{resposta.salvo_em ? ` · salva em ${formatDateTime(resposta.salvo_em)}` : ''}
          </p>
        )}
      </div>
    </div>
  );
};
