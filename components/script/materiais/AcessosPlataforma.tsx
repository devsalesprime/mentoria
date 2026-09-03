import React, { useState } from 'react';
import type { MaterialAcesso } from '../../../hooks/useScriptFicha';
import { Button } from '../../ui/Button';
import { ACESSO_PLATAFORMA_AVISO } from './categorias';

interface AcessosPlataformaProps {
  acessos: MaterialAcesso[];
  /** Recebe a lista completa nova; o pai salva no servidor. Devolve false se falhou. */
  onChange: (next: MaterialAcesso[]) => Promise<boolean> | boolean;
  disabled?: boolean;
}

const inputClass =
  'w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none';

export function maskSenha(senha: string): string {
  if (!senha) return '';
  return '•'.repeat(Math.min(12, Math.max(6, senha.length)));
}

/** Secao "Acesso à sua plataforma de conteúdo (opcional)": varias plataformas, senha mascarada com "mostrar". */
export const AcessosPlataforma: React.FC<AcessosPlataformaProps> = ({ acessos, onChange, disabled }) => {
  const [url, setUrl] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [obs, setObs] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(acessos.length === 0);

  const add = async () => {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      setErro('O endereço precisa começar com https:// ou http://');
      return;
    }
    setErro('');
    setSaving(true);
    const ok = await onChange([...acessos, { plataforma_url: u, login: login.trim(), senha, observacoes: obs.trim() }]);
    setSaving(false);
    if (ok) {
      setUrl(''); setLogin(''); setSenha(''); setObs(''); setShowNew(false);
      setFormOpen(false);
    } else {
      setErro('Não deu para salvar agora. Tente de novo.');
    }
  };

  const remove = async (index: number) => {
    setSaving(true);
    await onChange(acessos.filter((_, i) => i !== index));
    setSaving(false);
    setShown((s) => { const n = { ...s }; delete n[index]; return n; });
  };

  return (
    <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
      <h3 className="font-serif text-xl text-white">Acesso à sua plataforma de conteúdo (opcional)</h3>
      <p className="text-sm text-white/60 font-sans leading-relaxed">{ACESSO_PLATAFORMA_AVISO}</p>

      {acessos.length > 0 && (
        <ul className="space-y-2">
          {acessos.map((a, i) => (
            <li key={`${a.plataforma_url}-${i}`} className="p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg space-y-1">
              <div className="flex items-start justify-between gap-3">
                <a href={a.plataforma_url} target="_blank" rel="noreferrer" className="text-sm text-prosperus-gold-light hover:underline font-sans break-all">
                  {a.plataforma_url}
                </a>
                <Button
                  variant="icon"
                  size="xs"
                  disabled={disabled || saving}
                  onClick={() => remove(i)}
                  aria-label={`Remover acesso ${a.plataforma_url}`}
                  className="!text-white/50 hover:!text-red-400 flex-shrink-0"
                >
                  ✕
                </Button>
              </div>
              <p className="text-xs text-white/60 font-sans">
                <span className="text-white/40">Login:</span> {a.login || 'não informado'}
                <span className="mx-2 text-white/20">|</span>
                <span className="text-white/40">Senha:</span>{' '}
                <span className="font-mono">{a.senha ? (shown[i] ? a.senha : maskSenha(a.senha)) : 'não informada'}</span>
                {a.senha && (
                  <button
                    type="button"
                    onClick={() => setShown((s) => ({ ...s, [i]: !s[i] }))}
                    className="ml-2 text-[11px] text-prosperus-gold-light hover:underline"
                  >
                    {shown[i] ? 'esconder' : 'mostrar'}
                  </button>
                )}
              </p>
              {a.observacoes && <p className="text-xs text-white/50 font-sans whitespace-pre-line">{a.observacoes}</p>}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="space-y-2 pt-1">
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErro(''); }}
            placeholder="URL da plataforma (https://...)"
            aria-label="URL da plataforma"
            className={inputClass}
            disabled={disabled}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Login"
              aria-label="Login"
              autoComplete="off"
              className={inputClass}
              disabled={disabled}
            />
            <div className="relative w-full">
              <input
                type={showNew ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Senha"
                aria-label="Senha"
                autoComplete="new-password"
                className={`${inputClass} pr-20`}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-prosperus-gold-light hover:underline"
              >
                {showNew ? 'esconder' : 'mostrar'}
              </button>
            </div>
          </div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            placeholder="Observações (ex.: o curso X está na aba Y)"
            aria-label="Observações do acesso"
            className={`${inputClass} resize-y`}
            disabled={disabled}
          />
          {erro && <p className="text-xs text-red-400 font-sans">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={add} disabled={disabled || saving || !url.trim()} loading={saving}>
              Salvar acesso
            </Button>
            {acessos.length > 0 && (
              <Button variant="ghost" size="md" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            )}
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setFormOpen(true)} disabled={disabled}>
          Adicionar outra plataforma
        </Button>
      )}
    </div>
  );
};
