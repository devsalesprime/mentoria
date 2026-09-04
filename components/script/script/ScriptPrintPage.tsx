import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { parseScript } from './parseScript';
import { ScriptPaper } from './ScriptPaper';

/**
 * Pagina de impressao do script (/dashboard/script/imprimir?doc=treinamento|campo|ambos&versao=N).
 * Fora do layout do Dashboard (que tem containers com overflow escondido e altura da janela: imprimir de dentro dele
 * cortava o PDF na primeira pagina). Aqui a folha (ScriptPaper) fica num documento simples: A4 pelas regras de
 * @page em styles/globals.css, quebra de pagina antes de cada passo, sem barra fixa. O titulo do documento vira o nome
 * do PDF: Documento-de-treinamento-<clube> ou Script-de-campo-<clube> (os dois: Script-7-passos-<clube>).
 * Abre a caixa de impressao sozinha depois de renderizar; o botao "Imprimir" repete.
 */
export type DocImpressao = 'treinamento' | 'campo' | 'ambos';

export function docDaQuery(v: string | null): DocImpressao {
  return v === 'campo' || v === 'treinamento' ? v : 'ambos';
}

export function slugArquivo(s: string): string {
  return (s || 'clube').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'clube';
}

export function nomeArquivo(doc: DocImpressao, clubNome: string): string {
  const clube = slugArquivo(clubNome);
  if (doc === 'treinamento') return `Documento-de-treinamento-${clube}`;
  if (doc === 'campo') return `Script-de-campo-${clube}`;
  return `Script-7-passos-${clube}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ScriptPrintPageProps {
  token: string;
  /** Desliga a impressao automatica (testes). */
  autoPrint?: boolean;
}

export const ScriptPrintPage: React.FC<ScriptPrintPageProps> = ({ token, autoPrint = true }) => {
  const [params] = useSearchParams();
  const doc = docDaQuery(params.get('doc'));
  const versaoPedida = Number(params.get('versao'));
  const [clubNome, setClubNome] = useState('');
  const [versao, setVersao] = useState<{ versao: number; content_md: string; created_at: string; status: string; aprovado_em: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const impresso = useRef(false);
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ficha, lista] = await Promise.all([
          axios.get('/api/script/ficha', headers).catch(() => null),
          axios.get('/api/script/versoes', headers),
        ]);
        if (!vivo) return;
        const nome = ficha?.data?.data?.club?.nome || '';
        setClubNome(nome);
        const versoes: { versao: number }[] = lista.data?.versoes || [];
        const n = Number.isInteger(versaoPedida) && versaoPedida >= 1 && versoes.some((v) => v.versao === versaoPedida)
          ? versaoPedida
          : (versoes[0]?.versao ?? null);
        if (n == null) { setErro('Ainda não existe uma versão do script para imprimir.'); return; }
        const res = await axios.get(`/api/script/versoes/${n}`, headers);
        if (!vivo) return;
        if (res.data?.success) setVersao(res.data.versao);
        else setErro('Não deu para abrir a versão.');
      } catch (e: any) {
        if (vivo) setErro(e?.response?.data?.message || e?.message || 'Não deu para carregar o script.');
      }
    })();
    return () => { vivo = false; };
  }, [headers, versaoPedida]);

  const parsed = useMemo(() => (versao?.content_md ? parseScript(versao.content_md) : null), [versao?.content_md]);

  // Quais documentos entram: treinamento = d1 (ou o unico), campo = d2 (ou o unico), ambos = todos
  const apenas = useMemo(() => {
    if (!parsed) return undefined;
    if (doc === 'ambos' || parsed.documentos.length < 2) return undefined;
    return [doc === 'campo' ? 'd2' : 'd1'];
  }, [parsed, doc]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = nomeArquivo(doc, clubNome);
  }, [doc, clubNome]);

  useEffect(() => {
    if (!parsed || !autoPrint || impresso.current || typeof window === 'undefined') return;
    impresso.current = true;
    const t = setTimeout(() => { try { window.print(); } catch { /* sem caixa de impressao */ } }, 400);
    return () => clearTimeout(t);
  }, [parsed, autoPrint]);

  const rotulo = doc === 'treinamento' ? 'Documento de treinamento' : doc === 'campo' ? 'Script de campo' : 'Os dois documentos';

  return (
    <div className="script-print-page min-h-screen bg-prosperus-neutral-white text-prosperus-neutral-black">
      <div className="script-no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-prosperus-navy-panel/15 bg-white">
        <p className="text-sm text-prosperus-navy-panel">
          <span className="font-semibold">{rotulo}</span>
          {clubNome ? ` · ${clubNome}` : ''}{versao ? ` · versão ${versao.versao}` : ''}
          <span className="text-prosperus-navy-panel/60"> · na caixa de impressão, escolha "Salvar como PDF".</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => { if (typeof window !== 'undefined') window.print(); }} disabled={!parsed} className="script-grifo-btn script-grifo-btn-primario">Imprimir ou salvar em PDF</button>
          <button type="button" onClick={() => { if (typeof window !== 'undefined') window.close(); }} className="script-grifo-btn script-grifo-btn-secundario">Fechar</button>
        </div>
      </div>
      {erro && <p className="px-4 py-6 text-sm text-red-700">{erro}</p>}
      {!erro && !parsed && <p className="px-4 py-6 text-sm text-prosperus-navy-panel/70">Carregando o script...</p>}
      {parsed && (
        <div className="py-4 px-2 sm:px-4">
          <ScriptPaper
            doc={parsed}
            clubNome={clubNome || 'Prosperus Exclusive'}
            versao={versao?.versao ?? null}
            escritoEm={formatDate(versao?.created_at)}
            aprovadoEm={versao?.status === 'aprovado' ? formatDate(versao?.aprovado_em) : null}
            docAtivo={apenas ? apenas[0] : (parsed.documentos[0]?.id || '')}
            apenas={apenas}
            todosVisiveis
            refFor={() => () => undefined}
            comentariosDo={() => null}
          />
        </div>
      )}
    </div>
  );
};

export default ScriptPrintPage;
