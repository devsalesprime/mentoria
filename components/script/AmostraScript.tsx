import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { parseScript } from './script/parseScript';
import { ScriptReader } from './script/ScriptReader';
import { NAV_INICIO, clampNav } from './script/telas';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

/**
 * Amostra do script (onda I, item A1, decisao D2): o script de exemplo que o admin configurou
 * (clube + versao em `cohort_config.amostra_script`) aberto no MESMO leitor, em modo leitura.
 *
 * O que a amostra tem: o conteudo inteiro e a navegacao inteira (o resumo, os 7 passos, a preparacao).
 * O que ela NAO tem: grifo, comentario, tarefa, acao (aprovar, gerar apresentacao, baixar) e WhatsApp.
 * Em cima, uma faixa dizendo de quem e o script e o caminho de volta. O nome do clube na faixa sai sem o
 * parentese interno (onda J, item 27): "Prosperus (script do Danilo)" vira "Prosperus".
 *
 * Nenhum clube e nenhuma versao vivem aqui: tudo vem de GET /api/script/amostra, que devolve 404
 * quando o admin ainda nao configurou nada (e ai a tela inicial nem oferece o botao).
 */

export const COPY_AMOSTRA_VOLTAR = 'Voltar para a tela inicial';
export const COPY_AMOSTRA_SEM = 'Ainda não há um exemplo publicado.';

/** Nome do clube sem o parêntese interno: "Prosperus (script do Danilo)" vira "Prosperus". */
export function nomeSemParenteses(nome: string): string {
  return (nome || '').replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

const SEM_MARCAS: Set<number> = new Set<number>();

interface AmostraDados {
  club_slug: string;
  club_nome: string;
  versao: number;
  content_md: string;
}

interface AmostraScriptProps {
  token: string;
  /** "Voltar": devolve a pessoa para a tela inicial. */
  onVoltar: () => void;
}

export const AmostraScript: React.FC<AmostraScriptProps> = ({ token, onVoltar }) => {
  const [amostra, setAmostra] = useState<AmostraDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState(NAV_INICIO);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    (async () => {
      try {
        const res = await axios.get('/api/script/amostra', { headers: { Authorization: `Bearer ${token}` } });
        if (!vivo) return;
        if (res.data?.success && res.data.amostra) setAmostra(res.data.amostra as AmostraDados);
        else setErro(COPY_AMOSTRA_SEM);
      } catch (e: any) {
        if (vivo) setErro(e?.response?.data?.message || COPY_AMOSTRA_SEM);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  const doc = useMemo(() => (amostra?.content_md ? parseScript(amostra.content_md) : null), [amostra?.content_md]);

  const faixa = (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-prosperus-gold-dark/30 bg-prosperus-navy-panel px-4 py-3"
      data-testid="amostra-faixa"
    >
      <p className="text-sm text-white/80 font-sans">
        {amostra ? `Exemplo: script do ${nomeSemParenteses(amostra.club_nome) || amostra.club_nome}` : 'Exemplo de script'}
      </p>
      <Button variant="ghost" size="md" onClick={onVoltar} data-testid="amostra-voltar">{COPY_AMOSTRA_VOLTAR}</Button>
    </div>
  );

  if (carregando) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto" data-testid="amostra-script">
        {faixa}
        <div className="min-h-[200px] flex items-center justify-center">
          <LoadingSpinner size="lg" label="Abrindo o exemplo" />
        </div>
      </div>
    );
  }

  if (!amostra || !doc) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto" data-testid="amostra-script">
        {faixa}
        <p className="text-sm text-white/60 font-sans" data-testid="amostra-erro">{erro || COPY_AMOSTRA_SEM}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 script-screen" data-testid="amostra-script">
      {faixa}
      <ScriptReader
        amostra
        doc={doc}
        clubNome={amostra.club_nome}
        tela={tela}
        onTela={(t) => setTela(clampNav(t))}
        documento="treinamento"
        marcadas={SEM_MARCAS}
        comentariosDo={() => null}
        totalGrifos={0}
        rootRef={rootRef}
      />
    </div>
  );
};

export default AmostraScript;
