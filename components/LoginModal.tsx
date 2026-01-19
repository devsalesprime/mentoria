import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { motion } from 'framer-motion';

// ... imports remain the same

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userData: { name: string, email: string, token: string }) => void;
  onAdminAccess?: (token?: string) => void;
  initialAdminMode?: boolean; // New prop
}

// WhatsApp Icon Component
const WhatsAppIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="mr-2">
    <path d="M7 0C3.14075 0 0 3.14075 0 7C0 8.23469 0.320937 9.40906 0.932812 10.4697L0.284375 12.8353C0.245938 12.9753 0.284375 13.125 0.385 13.2256C0.46375 13.3044 0.570938 13.3481 0.68125 13.3481C0.710938 13.3481 0.741562 13.3447 0.77125 13.3369L3.25063 12.6869C4.36406 13.3856 5.64594 13.7812 7 13.7812C10.8592 13.7812 14 10.6405 14 6.78125C14 2.922 10.8592 0 7 0ZM7 12.4688C5.89094 12.4688 4.83219 12.1581 3.90688 11.5728L3.73188 11.4625L1.87906 11.9481L2.39969 10.1544L2.27937 9.96188C1.65594 8.96656 1.3125 7.8225 1.3125 6.64062C1.3125 3.50437 3.86312 0.953125 7 0.953125C10.1369 0.953125 12.6875 3.50437 12.6875 6.64062C12.6875 9.77687 10.1369 12.4688 7 12.4688Z" />
    <path d="M10.0515 8.35619C9.89748 8.27838 9.13607 7.90463 8.99354 7.85091C8.85002 7.79622 8.74602 7.76903 8.64102 7.92873C8.53702 8.08941 8.23933 8.43598 8.14846 8.54223C8.05858 8.64942 7.96771 8.66254 7.81368 8.58473C7.65966 8.50692 7.16328 8.3441 6.57563 7.82121C6.11027 7.40728 5.79634 6.89599 5.70546 6.7363C5.61459 6.57562 5.6968 6.49156 5.7738 6.41546C5.84292 6.34714 5.92867 6.23746 6.00649 6.14731C6.0843 6.05621 6.11142 5.99028 6.16305 5.88397C6.21555 5.77678 6.1893 5.68366 6.14992 5.60444C6.11054 5.52434 5.80946 4.77977 5.68521 4.47571C5.56358 4.18005 5.44111 4.22026 5.34924 4.21589C5.26352 4.21239 5.16377 4.21151 5.06402 4.21151C4.9634 4.21151 4.80155 4.2492 4.66421 4.39891C4.52687 4.5495 4.13849 4.91422 4.13849 5.65609C4.13849 6.40234 4.67908 7.1233 4.7569 7.22911C4.83471 7.3363 5.83221 8.87413 7.35928 9.53326C8.88636 10.1924 8.88636 9.97914 9.15592 9.95383C9.42636 9.92839 10.0244 9.59966 10.1478 9.25263C10.2721 8.9056 10.2721 8.61198 10.2327 8.54223C10.1942 8.4733 10.104 8.43598 10.0515 8.35619Z" />
  </svg>
);

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onAdminAccess,
  initialAdminMode = false
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(initialAdminMode);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Sync state when prop or isOpen changes
  React.useEffect(() => {
    if (isOpen) {
      setIsAdminMode(initialAdminMode);
    }
  }, [isOpen, initialAdminMode]);

  const MEMBER_API_URL = '/auth/verify-member';
  const ADMIN_API_URL = '/auth/admin-login';

  const handleMemberLogin = async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(MEMBER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Resposta inválida do servidor.");
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Erro: ${response.status}`);

      if (data.allowed && data.user) {
        setStatus('success');
        if (data.token) localStorage.setItem('memberToken', data.token);

        setTimeout(() => {
          onLoginSuccess({
            name: data.user.name || 'Membro',
            email: data.user.email || email,
            token: data.token
          });
          setStatus('idle');
          setEmail('');
        }, 1000);
      } else {
        throw new Error(data.message || 'Acesso não autorizado.');
      }
    } catch (err: any) {
      console.error("Erro Member:", err);
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao validar acesso.');
    }
  };

  const handleAdminLogin = async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(ADMIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Resposta inválida do servidor.");
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Erro: ${response.status}`);

      if (data.success && data.token) {
        setStatus('success');
        setTimeout(() => {
          if (onAdminAccess) onAdminAccess(data.token);
          setStatus('idle');
          setEmail('');
          setPassword('');
          setIsAdminMode(false);
        }, 1000);
      } else {
        throw new Error(data.message || 'Credenciais inválidas.');
      }
    } catch (err: any) {
      console.error("Erro Admin:", err);
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao fazer login.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (isAdminMode) {
      if (!password) return;
      handleAdminLogin();
    } else {
      handleMemberLogin();
    }
  };

  const tryAgain = () => {
    setStatus('idle');
    setErrorMessage('');
    setPassword('');
  };

  const handleClose = () => {
    setStatus('idle');
    setEmail('');
    setPassword('');
    setErrorMessage('');
    setIsAdminMode(false);
    onClose();
  };

  const toggleAdminMode = () => {
    setIsAdminMode(!isAdminMode);
    setStatus('idle');
    setErrorMessage('');
    setPassword('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="text-center relative">
        <h2 className="font-serif text-3xl text-white mb-2">
          {isAdminMode ? 'Acesso Administrativo' : 'Área do Membro'}
        </h2>
        <p className="font-sans text-prosperus-neutral-grey/60 mb-8 text-sm">
          {isAdminMode ? 'Digite suas credenciais de administrador.' : 'Acesso exclusivo para mentores aprovados no Prosperus Club.'}
        </p>

        {status === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-prosperus-navy-dark border border-green-500/30 p-8 rounded-sm"
          >
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 border border-green-500/50">
              <span className="text-green-400 text-3xl">✓</span>
            </div>
            <h3 className="font-serif text-2xl text-white mb-2">Login Efetuado</h3>
            <p className="font-sans text-sm text-prosperus-neutral-grey/80 mb-6">
              Redirecionando...
            </p>
            <div className="w-full h-1 bg-white/10 rounded overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1 }}
                className="h-full bg-green-400"
              />
            </div>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-left relative group">
              <label htmlFor="email" className="block font-sans text-xs uppercase tracking-widest text-prosperus-gold mb-2">
                {isAdminMode ? 'Email de Administrador' : 'Seu Email Cadastrado'}
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  placeholder={isAdminMode ? "admin@salesprime.com.br" : "ex: nome@empresa.com.br"}
                  disabled={status === 'loading'}
                  className={`w-full bg-prosperus-navy-dark border p-4 text-white font-sans disabled:opacity-50 transition-all duration-300
                    ${status === 'error'
                      ? 'border-red-500/50 focus:border-red-500'
                      : 'border-white/10 focus:border-prosperus-gold'
                    } outline-none`}
                />
              </div>
            </div>

            {isAdminMode && (
              <div className="text-left relative group animate-fadeIn">
                <label htmlFor="password" className="block font-sans text-xs uppercase tracking-widest text-prosperus-gold mb-2">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (status === 'error') setStatus('idle');
                    }}
                    placeholder="••••••••"
                    disabled={status === 'loading'}
                    className={`w-full bg-prosperus-navy-dark border p-4 text-white font-sans disabled:opacity-50 transition-all duration-300
                                ${status === 'error'
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-white/10 focus:border-prosperus-gold'
                      } outline-none`}
                  />
                </div>
              </div>
            )}

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-900/20 border border-red-500/30 p-4 text-left rounded-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="text-red-400 mt-0.5 font-bold text-lg">✕</span>
                  <div className="flex-1 w-full">
                    <p className="text-red-200 text-sm font-sans font-bold mb-2">Acesso Negado</p>

                    <p className="text-red-100 font-sans text-xs mb-3 font-semibold">
                      {errorMessage}
                    </p>

                    <div className="w-full h-[1px] bg-red-500/20 my-2"></div>

                    <div className="mb-4">
                      <p className="text-red-200/70 text-[10px] font-sans leading-relaxed mb-1 uppercase tracking-wider">
                        Já é membro?
                      </p>
                      <p className="text-red-100 text-xs font-sans mb-2">
                        Verifique se o e-mail é o mesmo do contrato.
                      </p>
                      <p className="text-red-100 text-xs font-sans mb-2">
                        Ou contate nosso suporte:
                      </p>
                      <a
                        href="https://wa.me/5511956663958"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-bold rounded transition-colors group"
                      >
                        <WhatsAppIcon />
                        Suporte
                      </a>
                    </div>

                    <div className="pt-2 border-t border-red-500/20">
                      <p className="text-red-200/70 text-[10px] font-sans leading-relaxed mb-1 mt-2 uppercase tracking-wider">
                        Não é membro do Prosperus Club?
                      </p>
                      <a
                        href="https://wa.me/551131634500"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full py-2 bg-white/5 hover:bg-white/10 border border-white/20 text-white text-xs font-bold rounded transition-colors"
                      >
                        <WhatsAppIcon />
                        Falar com SDR
                      </a>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={tryAgain}
                  className="mt-4 w-full py-2 bg-transparent hover:bg-red-500/10 text-red-300 text-[10px] uppercase tracking-wider transition-colors"
                >
                  ← Tentar outro e-mail
                </button>
              </motion.div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={status === 'loading' || !email || (isAdminMode && !password) || status === 'error'}
            >
              {status === 'loading' ? "Verificando..." : (isAdminMode ? "Entrar como Admin" : "Validar Acesso")}
            </Button>

            <div className="flex justify-between items-center text-xs text-prosperus-neutral-grey/30 pt-4 border-t border-white/5">
              <p>Ambiente Seguro <i className="bi bi-lock-fill"></i></p>
              {onAdminAccess && (
                <button
                  type="button"
                  onClick={toggleAdminMode}
                  className={`transition-colors ${isAdminMode ? 'text-prosperus-gold font-bold' : 'hover:text-prosperus-gold'}`}
                >
                  {isAdminMode ? 'Voltar para Login de Membro' : 'Sou Admin'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};