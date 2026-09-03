import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Button } from '../ui/Button';
import { FichaBadge, MaterialsBadge, JobStatusBadge, JobTipoBadge, formatDateTime } from './CohortOverview';
import type { CohortJob } from './CohortOverview';
import { renderMarkdown } from '../../utils/markdown';
import { MATERIAL_CATEGORIA_LABEL } from '../script/materiais/categorias';
import { maskSenha } from '../script/materiais/AcessosPlataforma';
import type { ScriptBlockView, ScriptFieldView, FichaStatus, MaterialsStatus } from '../../data/script-ficha-fields';

interface Member { email: string; nome: string | null; user_id: string | null; ultimo_login: string | null; user_name?: string | null }
interface ClubFile { id: string; userId: string; category: string; fileName: string; fileType: string | null; fileSize: number | null; createdAt: string; ownerEmail: string; ownerName?: string | null }
interface MaterialLink { url: string; rotulo: string; tipo: string }
interface MaterialAcesso { plataforma_url: string; login: string; senha: string; observacoes: string }
/** Materiais de UMA pessoa do clube (arquivos, links, observacoes, acessos, submitted_at). */
interface Pessoa {
  email: string;
  nome: string | null;
  user_id: string | null;
  membro: boolean;
  files: ClubFile[];
  links: MaterialLink[];
  observacoes: string;
  acessos: MaterialAcesso[];
  /** Resposta colada da IA do mentor ("Peca para a sua IA preencher"). */
  resposta_ia: { texto: string; salvo_em: string | null; resumo: string } | null;
  /** WhatsApp informado em "Confirmar e ir para a ficha" (aviso do pre-preenchimento). */
  notify_phone: string | null;
  submitted_at: string | null;
}

/** Versao do script (sem conteudo; o conteudo vem de GET /api/admin/clubs/:slug/script-versoes/:versao). */
interface ScriptVersao {
  id: string;
  versao: number;
  status: 'rascunho' | 'aprovado';
  resumo: string;
  job_id: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
  created_at: string;
  comentarios_count?: number;
  content_md?: string;
}
interface ScriptComentario { id: string; versao: number; passo: number; texto: string; autor_email: string | null; autor_nome: string | null; created_at: string }
interface ContextoItem { id: string; field_key: string; tipo: string; file_name: string | null; url: string; texto: string; legenda: string; transcricao: string | null; erro_transcricao: string | null; autor_email: string | null; autor_nome: string | null; created_at: string; download_url: string | null }

interface ClubDetail {
  club: { slug: string; nome: string; ativo: boolean };
  membros: Member[];
  files: ClubFile[];
  pessoas: Pessoa[];
  pessoas_enviaram: number;
  /** Fila deste clube (prefill, script, refinar; mais recentes primeiro). */
  jobs?: CohortJob[];
  /** Script escrito: versoes (mais recente primeiro) e comentarios por passo. */
  versoes?: ScriptVersao[];
  comentarios?: ScriptComentario[];
  /** Contexto por pergunta { "3.3": [...] }. */
  contexto?: Record<string, ContextoItem[]>;
  /** Forma antiga (por clube) que existia antes dos materiais por pessoa. */
  legado: { links: MaterialLink[]; observacoes: string } | null;
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  ficha_status: FichaStatus;
  prefill_meta: any;
  prefilled_at: string | null;
  reviewed_at: string | null;
  last_user_activity_at: string | null;
  blocos: ScriptBlockView[];
  hoje: { dia: number; titulo: string; minutos: number; em_breve: boolean };
  progresso: { total: number; decididos: number; obrigatorios: number; obrigatorios_decididos: number };
}

interface CohortClubDetailProps {
  slug: string;
  token: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  sugerido: 'sugerido',
  confirmado: 'confirmado',
  editado: 'editado',
  vazio: 'vazio',
  aceito_vazio: 'aceito vazio',
};

const STATUS_CLASS: Record<string, string> = {
  sugerido: 'bg-blue-600/20 text-blue-400',
  confirmado: 'bg-green-600/20 text-green-400',
  editado: 'bg-green-600/20 text-green-300',
  vazio: 'bg-gray-600/20 text-gray-400',
  aceito_vazio: 'bg-yellow-600/20 text-yellow-400',
};

const CATEGORY_LABEL: Record<string, string> = MATERIAL_CATEGORIA_LABEL;

function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CohortClubDetail: React.FC<CohortClubDetailProps> = ({ slug, token, showToast, onBack }) => {
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ficha' | 'materiais' | 'script' | 'membros' | 'importar'>('ficha');
  // Aba Script: conteudo por versao (carregado sob demanda) e qual esta aberta
  const [versaoAberta, setVersaoAberta] = useState<number | null>(null);
  const [conteudo, setConteudo] = useState<Record<number, string>>({});
  const [carregandoVersao, setCarregandoVersao] = useState<number | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);

  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string; errors?: string[]; warnings?: string[]; skipped?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true });
  // Senhas de acesso a plataforma: mascaradas por padrao, "mostrar" por item (chave email:indice)
  const [senhaVisivel, setSenhaVisivel] = useState<Record<string, boolean>>({});
  // Resposta da IA por pessoa: fechada por padrao (texto longo)
  const [respostaAberta, setRespostaAberta] = useState<Record<string, boolean>>({});

  const headers = { Authorization: `Bearer ${token}` };

  const downloadRespostaMd = (p: Pessoa) => {
    if (!p.resposta_ia?.texto) return;
    const blob = new Blob([p.resposta_ia.texto], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resposta-ia-${slug}-${p.email.replace(/[^a-z0-9]+/gi, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/clubs/${slug}/script-ficha`, { headers });
      if (res.data.success) setDetail(res.data.data);
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao carregar o clube', 'error');
    } finally {
      setLoading(false);
    }
  }, [slug, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const saveMembers = async (body: any) => {
    setSavingMembers(true);
    try {
      const res = await axios.put(`/api/admin/clubs/${slug}/members`, body, { headers });
      if (res.data.success) {
        showToast('Membros atualizados', 'success');
        setNewEmail('');
        setNewName('');
        await fetchDetail();
      }
    } catch (e: any) {
      const errs = e.response?.data?.errors;
      showToast(errs ? errs.join('; ') : (e.response?.data?.message || 'Erro ao salvar membros'), 'error');
    } finally {
      setSavingMembers(false);
    }
  };

  const handleImport = async () => {
    setImportResult(null);
    let json: any;
    try {
      json = JSON.parse(importText.charCodeAt(0) === 0xfeff ? importText.slice(1) : importText);
    } catch (e: any) {
      setImportResult({ ok: false, message: `JSON inválido: ${e.message}` });
      return;
    }
    setImporting(true);
    try {
      const res = await axios.put(`/api/admin/clubs/${slug}/script-ficha`, json, { headers });
      setImportResult({ ok: true, message: res.data.message, warnings: res.data.warnings, skipped: res.data.skipped });
      showToast('Ficha pré-preenchida', 'success');
      await fetchDetail();
      setTab('ficha');
    } catch (e: any) {
      const d = e.response?.data;
      setImportResult({ ok: false, message: d?.message || e.message, errors: d?.errors, warnings: d?.warnings });
    } finally {
      setImporting(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
    e.target.value = '';
  };

  const downloadUrl = (id: string) => `/api/admin/files/${id}?token=${encodeURIComponent(token)}`;

  const fetchVersao = async (n: number): Promise<string | null> => {
    if (conteudo[n] != null) return conteudo[n];
    setCarregandoVersao(n);
    try {
      const res = await axios.get(`/api/admin/clubs/${slug}/script-versoes/${n}`, { headers });
      const md: string = res.data?.versao?.content_md || '';
      setConteudo((c) => ({ ...c, [n]: md }));
      return md;
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao abrir a versão', 'error');
      return null;
    } finally {
      setCarregandoVersao(null);
    }
  };

  const abrirVersao = async (n: number) => {
    if (versaoAberta === n) { setVersaoAberta(null); return; }
    const md = await fetchVersao(n);
    if (md != null) setVersaoAberta(n);
  };

  const baixarVersao = async (n: number) => {
    const md = await fetchVersao(n);
    if (md == null) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script-${slug}-v${n}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !detail) {
    return <div className="animate-pulse h-40 bg-white/5 rounded-xl" />;
  }
  if (!detail) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" onClick={onBack}>← Voltar</Button>
        <p className="text-sm text-white/60">Clube não encontrado.</p>
      </div>
    );
  }

  const renderField = (c: ScriptFieldView) => (
    <div key={c.key} className="border border-white/10 rounded-lg p-3 space-y-1.5 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-prosperus-gold">{c.key}</span>
        <span className="text-sm text-white font-semibold">{c.nome}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.obrigatorio ? 'bg-prosperus-gold/20 text-prosperus-gold' : 'bg-white/10 text-white/50'}`}>{c.obrigatorio ? 'S' : 'N'}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLASS[c.status] || ''}`}>{STATUS_LABEL[c.status] || c.status}</span>
        <span className="text-[10px] text-white/40">{c.classe}</span>
      </div>
      <p className="text-xs text-white/50">{c.pergunta}</p>
      {c.valor_efetivo ? (
        <p className="text-sm text-white/90 whitespace-pre-line">{c.valor_efetivo}</p>
      ) : c.sugerido ? (
        <p className="text-sm text-white/60 whitespace-pre-line">{c.sugerido}</p>
      ) : (
        <p className="text-xs text-white/30 italic">sem valor</p>
      )}
      {c.status === 'editado' && c.sugerido && (
        <p className="text-[11px] text-white/40 whitespace-pre-line">sugerido era: {c.sugerido}</p>
      )}
      {c.fonte && <p className="text-[11px] text-white/40">Fonte: {c.fonte}</p>}
      {c.alternativas?.length > 0 && (
        <p className="text-[11px] text-white/40">Alternativas: {c.alternativas.map((a) => `${a.sugerido} (${a.fonte || 'sem fonte'})`).join(' | ')}</p>
      )}
      {c.nota_interna && <p className="text-[11px] text-purple-300/80">Nota interna: {c.nota_interna}</p>}
      {(c.contexto_count || 0) > 0 && (
        <details className="text-[11px] text-white/60">
          <summary className="cursor-pointer text-prosperus-gold">Contexto do clube ({c.contexto_count})</summary>
          <ul className="mt-1 space-y-1">
            {(detail.contexto?.[c.key] || []).map((it) => (
              <li key={it.id} className="border-l border-white/10 pl-2">
                <span className="uppercase text-[10px] text-white/40">{it.tipo}</span>
                {it.autor_nome || it.autor_email ? <span className="ml-1 text-white/50">{it.autor_nome || it.autor_email}</span> : null}
                <span className="ml-1 text-white/30">{formatDateTime(it.created_at)}</span>
                {it.legenda && <p className="text-white/70">{it.legenda}</p>}
                {it.texto && <p className="text-white/80 whitespace-pre-line">{it.texto}</p>}
                {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{it.url}</a>}
                {it.transcricao && <p className="text-white/70 whitespace-pre-line italic">{it.transcricao}</p>}
                {it.erro_transcricao && <p className="text-red-300">transcrição falhou: {it.erro_transcricao}</p>}
                {it.file_name && it.download_url && <a href={`${it.download_url}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{it.file_name}</a>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {c.atualizado_por && <p className="text-[11px] text-white/30">{c.atualizado_por} · {formatDateTime(c.atualizado_em)}</p>}
    </div>
  );

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${tab === id ? 'bg-prosperus-gold text-black' : 'text-white/60 hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-1 !px-0">← Cohort</Button>
          <h3 className="text-xl font-semibold text-white">{detail.club.nome} <span className="text-xs text-white/40 font-normal">{detail.club.slug}{detail.club.ativo ? '' : ' · inativo'}</span></h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <FichaBadge status={detail.ficha_status} />
            <span className="text-xs text-white/50">{detail.progresso.obrigatorios_decididos}/{detail.progresso.obrigatorios} obrigatórios · {detail.progresso.decididos}/{detail.progresso.total} total</span>
            <MaterialsBadge status={detail.materials_status} count={detail.files.length} />
            <span className="text-xs text-white/50">{detail.pessoas_enviaram || 0}/{detail.membros.length} enviaram</span>
            <span className="text-xs text-white/40">hoje: dia {detail.hoje.dia}{detail.hoje.em_breve ? ' (em breve)' : ''}</span>
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            pré-preenchida {formatDateTime(detail.prefilled_at)} · atividade {formatDateTime(detail.last_user_activity_at)} · fechada {formatDateTime(detail.reviewed_at)}
          </p>
        </div>
        <button onClick={fetchDetail} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition self-start">Atualizar</button>
      </div>

      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
        {tabBtn('ficha', 'Ficha')}
        {tabBtn('materiais', `Materiais (${detail.files.length + (detail.pessoas || []).reduce((s, p) => s + p.links.length + p.acessos.length, 0)})`)}
        {tabBtn('script', `Script (${(detail.versoes || []).length})`)}
        {tabBtn('membros', `Membros (${detail.membros.length})`)}
        {tabBtn('importar', 'Importar JSON')}
      </div>

      {tab === 'ficha' && (
        <div className="space-y-3">
          {detail.blocos.map((b) => (
            <div key={b.numero} className="border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded((p) => ({ ...p, [b.numero]: !p[b.numero] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              >
                <span className="text-sm font-semibold text-white">{b.numero}. {b.nome} <span className="text-xs text-white/40 font-normal">{b.descricao}</span></span>
                <span className="text-xs text-white/50">{b.obrigatorios_decididos}/{b.obrigatorios} obrig. · {b.decididos}/{b.total} {b.fechado ? '· fechado' : ''} {expanded[b.numero] ? '▲' : '▼'}</span>
              </button>
              {expanded[b.numero] && (
                <div className="p-3 space-y-2">
                  {b.campos.map(renderField)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'materiais' && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40">
            Materiais são por pessoa: cada sócio vê só o que ele mesmo enviou. Aqui aparece tudo, com quem enviou.
            {detail.materials_status === 'submitted' ? ` Primeiro "Enviei o que tinha" do clube em ${formatDateTime(detail.materials_submitted_at)}.` : ' Ninguém do clube clicou em "Enviei o que tinha" ainda.'}
          </p>
          {(detail.pessoas || []).length === 0 && <p className="text-xs text-white/40">Nenhuma pessoa neste clube.</p>}
          {(detail.pessoas || []).map((p) => {
            const total = p.files.length + p.links.length + p.acessos.length;
            return (
              <div key={p.email} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.nome || p.email}{!p.membro && <span className="ml-2 text-[10px] text-yellow-400">fora do clube</span>}</p>
                    <p className="text-[11px] text-white/40">{p.email}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.submitted_at ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'}`}>
                    {p.submitted_at ? `Enviou em ${formatDateTime(p.submitted_at)}` : 'Não clicou em "Enviei o que tinha"'}
                  </span>
                </div>
                {p.notify_phone && (
                  <p className="text-[11px] text-white/50">WhatsApp para o aviso: <span className="font-mono text-white/80">{p.notify_phone}</span></p>
                )}
                {total === 0 && !p.observacoes && !p.resposta_ia && <p className="text-xs text-white/40">Nada enviado por esta pessoa.</p>}

                {p.resposta_ia?.texto && (
                  <div className="space-y-1 border border-white/10 rounded-lg p-2 bg-white/[0.02]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setRespostaAberta((s) => ({ ...s, [p.email]: !s[p.email] }))}
                        className="text-xs font-semibold text-white/70 hover:text-white text-left"
                        aria-expanded={!!respostaAberta[p.email]}
                      >
                        Resposta da IA {respostaAberta[p.email] ? '▲' : '▼'}
                        <span className="ml-2 font-normal text-white/50">{p.resposta_ia.resumo || 'sem leitura'}{p.resposta_ia.salvo_em ? ` · ${formatDateTime(p.resposta_ia.salvo_em)}` : ''}</span>
                      </button>
                      <Button variant="outline" size="xs" onClick={() => downloadRespostaMd(p)}>Baixar .md</Button>
                    </div>
                    {respostaAberta[p.email] && (
                      <pre className="text-[11px] text-white/80 font-mono whitespace-pre-wrap break-words max-h-96 overflow-y-auto custom-scrollbar bg-prosperus-navy rounded p-2">{p.resposta_ia.texto}</pre>
                    )}
                  </div>
                )}

                {p.files.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-white/70">Arquivos ({p.files.length})</h5>
                    <ul className="space-y-1">
                      {p.files.map((f) => (
                        <li key={f.id} className="text-sm border-b border-white/5 py-1.5">
                          <a href={downloadUrl(f.id)} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{f.fileName}</a>
                          <p className="text-[11px] text-white/40">{CATEGORY_LABEL[f.category] || f.category} · {formatSize(f.fileSize)} · {formatDateTime(f.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.links.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-white/70">Links ({p.links.length})</h5>
                    <ul className="space-y-1">
                      {p.links.map((l, i) => (
                        <li key={i} className="text-sm">
                          <a href={l.url} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{l.rotulo || l.url}</a>
                          <span className="text-[11px] text-white/40 ml-2">{l.tipo} · {l.url}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.acessos.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-white/70">Acessos à plataforma de conteúdo ({p.acessos.length})</h5>
                    <ul className="space-y-1.5">
                      {p.acessos.map((a, i) => {
                        const k = `${p.email}:${i}`;
                        return (
                          <li key={k} className="text-sm border border-white/10 rounded-lg p-2 bg-white/[0.02]">
                            <a href={a.plataforma_url} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{a.plataforma_url}</a>
                            <p className="text-xs text-white/70">
                              <span className="text-white/40">Login:</span> <span className="font-mono">{a.login || 'não informado'}</span>
                              <span className="mx-2 text-white/20">|</span>
                              <span className="text-white/40">Senha:</span>{' '}
                              <span className="font-mono">{a.senha ? (senhaVisivel[k] ? a.senha : maskSenha(a.senha)) : 'não informada'}</span>
                              {a.senha && (
                                <button
                                  type="button"
                                  onClick={() => setSenhaVisivel((s) => ({ ...s, [k]: !s[k] }))}
                                  className="ml-2 text-[11px] text-prosperus-gold hover:underline"
                                >
                                  {senhaVisivel[k] ? 'esconder' : 'mostrar'}
                                </button>
                              )}
                            </p>
                            {a.observacoes && <p className="text-[11px] text-white/50 whitespace-pre-line">{a.observacoes}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {p.observacoes && (
                  <p className="text-xs text-white/60 whitespace-pre-line border-t border-white/5 pt-2">Observações: {p.observacoes}</p>
                )}
              </div>
            );
          })}

          {detail.legado && (
            <div className="bg-white/5 border border-yellow-500/20 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-yellow-300">Legado (materiais por clube, antes da mudança para por pessoa)</h4>
              {detail.legado.links.length > 0 && (
                <ul className="space-y-1">
                  {detail.legado.links.map((l, i) => (
                    <li key={i} className="text-sm">
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{l.rotulo || l.url}</a>
                      <span className="text-[11px] text-white/40 ml-2">{l.tipo} · {l.url}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.legado.observacoes && (
                <p className="text-xs text-white/60 whitespace-pre-line">Observações: {detail.legado.observacoes}</p>
              )}
            </div>
          )}

          {(detail.jobs || []).length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-white">Fila do worker deste clube</h4>
              <ul className="space-y-1">
                {(detail.jobs || []).map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 text-xs border-b border-white/5 py-1.5">
                    <JobTipoBadge job={j} />
                    <JobStatusBadge status={j.status} />
                    <span className="text-white/80">{j.email}</span>
                    {j.notify_phone && <span className="font-mono text-white/50">{j.notify_phone}</span>}
                    <span className="text-white/40">tentativas {j.attempts} · criado {formatDateTime(j.created_at)}{j.finished_at ? ` · fim ${formatDateTime(j.finished_at)}` : ''}</span>
                    {j.error && <span className="text-red-300 break-all">{j.error}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-white/40">Reprocessar e ver todos: painel "Fila" na aba Cohort.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'script' && (
        <div className="space-y-4">
          {(detail.versoes || []).length === 0 ? (
            <p className="text-xs text-white/40">
              Nenhuma versão ainda. O worker grava a v1 depois que o mentor fecha a ficha (job "Script" na fila).
            </p>
          ) : (detail.versoes || []).map((v) => {
            const coms = (detail.comentarios || []).filter((c) => c.versao === v.versao);
            const aberta = versaoAberta === v.versao;
            return (
              <div key={v.id} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Script v{v.versao}
                      <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${v.status === 'aprovado' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-300'}`}>{v.status}</span>
                    </p>
                    <p className="text-[11px] text-white/40">
                      escrito {formatDateTime(v.created_at)}{v.job_id ? ` · job ${v.job_id}` : ''}{v.aprovado_em ? ` · aprovado ${formatDateTime(v.aprovado_em)} por ${v.aprovado_por || '?'}` : ''} · {coms.length} comentário(s)
                    </p>
                    {v.resumo && <p className="text-xs text-white/60 mt-1">{v.resumo}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => abrirVersao(v.versao)} loading={carregandoVersao === v.versao}>{aberta ? 'Fechar' : 'Ver'}</Button>
                    <Button variant="outline" size="xs" onClick={() => baixarVersao(v.versao)}>Baixar .md</Button>
                  </div>
                </div>
                {aberta && conteudo[v.versao] != null && (
                  <div
                    className="bg-prosperus-neutral-white text-prosperus-neutral-black rounded-lg p-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-sm
                      [&_h1]:font-serif [&_h1]:text-xl [&_h1]:text-prosperus-navy-panel [&_h2]:font-serif [&_h2]:text-lg [&_h2]:text-prosperus-navy-panel [&_h2]:mt-4 [&_h3]:font-serif [&_h3]:text-base [&_h3]:mt-3
                      [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-prosperus-gold-dark [&_blockquote]:pl-2 [&_blockquote]:italic"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(conteudo[v.versao]) }}
                  />
                )}
                {coms.length > 0 && (
                  <ul className="space-y-1.5">
                    {coms.map((c) => (
                      <li key={c.id} className="text-xs border-l-2 border-prosperus-gold/40 pl-2">
                        <span className="text-prosperus-gold font-semibold">{c.passo > 0 ? `Passo ${c.passo}` : 'Geral'}</span>
                        <span className="text-white/50 ml-2">{c.autor_nome || c.autor_email || '?'} · {formatDateTime(c.created_at)}</span>
                        <p className="text-white/80 whitespace-pre-line">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'membros' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          {detail.membros.length === 0 ? <p className="text-xs text-white/40">Nenhum e-mail cadastrado. Sem e-mail, ninguém entra por este clube.</p> : (
            <ul className="space-y-1">
              {detail.membros.map((m) => (
                <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-white/5 py-1.5">
                  <div>
                    <span className="text-white">{m.email}</span>
                    <span className="text-white/40 text-xs ml-2">{m.nome || m.user_name || ''}</span>
                    <p className="text-[11px] text-white/40">{m.user_id ? `login ${formatDateTime(m.ultimo_login)}` : 'nunca entrou'}</p>
                  </div>
                  <Button
                    variant="danger-soft"
                    size="xs"
                    disabled={savingMembers}
                    onClick={() => { if (window.confirm(`Remover ${m.email} do clube?`)) saveMembers({ remove: [m.email] }); }}
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e-mail@dominio.com"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome (opcional)"
              className="sm:w-56 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none"
            />
            <Button
              variant="primary"
              size="md"
              disabled={!newEmail.trim() || savingMembers}
              loading={savingMembers}
              onClick={() => saveMembers({ add: [{ email: newEmail.trim(), nome: newName.trim() || undefined }] })}
            >
              Adicionar
            </Button>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={savingMembers}
              onClick={() => saveMembers({ ativo: detail.club.ativo ? 0 : 1 })}
            >
              {detail.club.ativo ? 'Desativar clube' : 'Ativar clube'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'importar' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs text-white/60">
            Cole o JSON do contrato (CONTRATO-prefill-json.md) ou escolha o arquivo. Todos os 34 campos precisam estar presentes; campos que o mentor já decidiu não são sobrescritos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Escolher arquivo .json</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFilePick} className="hidden" />
            <Button variant="ghost" size="sm" onClick={() => { setImportText(''); setImportResult(null); }}>Limpar</Button>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={14}
            placeholder='{ "club_slug": "...", "campos": { "1.1": { ... } } }'
            className="w-full bg-prosperus-navy border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-white/30 outline-none"
          />
          <Button variant="primary" size="md" onClick={handleImport} disabled={!importText.trim()} loading={importing}>
            Importar para {detail.club.nome}
          </Button>
          {importResult && (
            <div className={`rounded-lg p-3 text-xs space-y-1 ${importResult.ok ? 'bg-green-600/10 border border-green-600/30 text-green-300' : 'bg-red-600/10 border border-red-600/30 text-red-300'}`}>
              <p className="font-semibold">{importResult.message}</p>
              {importResult.errors?.map((e, i) => <p key={i}>• {e}</p>)}
              {importResult.warnings?.map((w, i) => <p key={i} className="text-yellow-300">• {w}</p>)}
              {importResult.skipped && importResult.skipped.length > 0 && <p>Mantidos: {importResult.skipped.join(', ')}</p>}
            </div>
          )}
          {detail.prefill_meta && (
            <p className="text-[11px] text-white/40">
              Último import: {detail.prefill_meta.gerado_por || '?'} · gerado em {detail.prefill_meta.gerado_em || '?'} · importado {formatDateTime(detail.prefill_meta.importado_em)} · fontes: {(detail.prefill_meta.fontes_lidas || []).join(', ') || 'não informadas'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
