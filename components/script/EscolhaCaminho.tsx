/**
 * Escolha na entrada (SPEC-workflow-v2-decisoes-06-09 §1 decisão 1 e §2): antes de Materiais, quem é do
 * Exclusive escolhe como quer construir o script. Dois cartões, um botão em cada:
 *   Essencial -> as perguntas essenciais que fecham o cartão de bolso, para levar na reunião de amanhã
 *   (a copy não cita quantidade: o conjunto essencial muda com `essencial: true` em data/script-ficha-fields.json)
 *   Completo  -> a ficha inteira, com treinamento, roteiro de campo, apresentação e as aulas
 * A escolha grava `modo` na ficha do clube (PUT /api/script/ficha/modo) e leva para Materiais.
 * Do essencial dá para aprofundar depois; o caminho de volta não é oferecido.
 */
import React, { useState } from 'react';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptModo } from '../../data/script-ficha-fields';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

interface EscolhaCaminhoProps {
  ficha: UseScriptFicha;
  onNavigate?: (id: string) => void;
}

export const TITULO_ESCOLHA = 'Como você quer construir o seu script?';
export const NADA_SE_PERDE = 'Você pode começar pelo essencial e aprofundar depois: nada se perde.';

const CAMINHOS: { modo: ScriptModo; nome: string; descricao: string; botao: string }[] = [
  {
    modo: 'essencial',
    nome: 'Essencial',
    descricao: 'O cartão de bolso em minutos: as falas-chave dos 7 passos, o investimento total e a pergunta de recomendação, para levar para a reunião de amanhã.',
    botao: 'Começar pelo essencial',
  },
  {
    modo: 'completo',
    nome: 'Completo',
    descricao: 'O script inteiro: treinamento com a anatomia de cada fala, roteiro de campo, apresentação comercial e as aulas da Dani em cada passo.',
    botao: 'Construir o completo',
  },
];

export const EscolhaCaminho: React.FC<EscolhaCaminhoProps> = ({ ficha, onNavigate }) => {
  const { data, loading, loaded, error, definirModo } = ficha;
  const [salvando, setSalvando] = useState<ScriptModo | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 min-h-[300px] flex items-center justify-center">
        <LoadingSpinner size="lg" label="Carregando" />
      </div>
    );
  }

  if (loaded && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 text-center space-y-3">
        <h3 className="font-serif text-2xl text-white">Seu script</h3>
        <p className="text-sm text-white/60 font-sans">{error || 'Esta área ainda não está liberada para o seu acesso. Fale com o Caio.'}</p>
      </div>
    );
  }

  if (!data) return null;

  const escolher = async (modo: ScriptModo) => {
    setSalvando(modo);
    setFalha(null);
    const r = await definirModo(modo);
    setSalvando(null);
    if (!r.ok) {
      setFalha(r.message || 'Não deu para salvar a escolha agora. Tente de novo.');
      return;
    }
    onNavigate?.('script_materiais');
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto" data-testid="escolha-caminho">
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
        <h2 className="font-serif text-2xl sm:text-3xl text-white">{TITULO_ESCOLHA}</h2>
        <p className="text-sm text-white/70 font-sans leading-relaxed">{NADA_SE_PERDE}</p>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {CAMINHOS.map((c) => (
          <section
            key={c.modo}
            aria-label={c.nome}
            data-testid={`caminho-${c.modo}`}
            className="bg-prosperus-navy-panel border border-white/10 rounded-lg p-4 sm:p-6 flex flex-col gap-3"
          >
            <h3 className="font-serif text-xl sm:text-2xl text-white">{c.nome}</h3>
            <p className="text-sm text-white/70 font-sans leading-relaxed flex-1">{c.descricao}</p>
            <Button
              variant="primary"
              size="lg"
              className="w-full min-h-[48px]"
              data-testid={`escolher-${c.modo}`}
              onClick={() => escolher(c.modo)}
              loading={salvando === c.modo}
              disabled={!!salvando}
            >
              {c.botao}
            </Button>
          </section>
        ))}
      </div>

      {falha && <p className="text-xs text-red-400 font-sans" data-testid="escolha-erro">{falha}</p>}
    </div>
  );
};

export default EscolhaCaminho;
