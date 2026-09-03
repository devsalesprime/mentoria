import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Button } from '../ui/Button';
import { FichaBadge, MaterialsBadge, formatDateTime } from './CohortOverview';
import type { ScriptBlockView, ScriptFieldView, FichaStatus, MaterialsStatus } from '../../data/script-ficha-fields';

interface Member { email: string; nome: string | null; user_id: string | null; ultimo_login: string | null; user_name?: string | null }
interface ClubFile { id: string; userId: string; category: string; fileName: string; fileType: string | null; fileSize: number | null; createdAt: string; ownerEmail: string }
interface MaterialLink { url: string; rotulo: string; tipo: string }

interface ClubDetail {
  club: { slug: string; nome: string; ativo: boolean };
  membros: Member[];
  files: ClubFile[];
  materials: { links: MaterialLink[]; observacoes: string };
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

const CATEGORY_LABEL: Record<string, string> = {
  script_transcricao_venda: 'Transcrição de venda',
  script_crm: 'CRM',
  script_apostila_slides: 'Apostila / slides',
  script_proposta_roteiro: 'Proposta / roteiro',
  script_outros: 'Outros',
};

function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CohortClubDetail: React.FC<CohortClubDetailProps> = ({ slug, token, showToast, onBack }) => {
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ficha' | 'materiais' | 'membros' | 'importar'>('ficha');

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);

  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string; errors?: string[]; warnings?: string[]; skipped?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true });

  const headers = { Authorization: `Bearer ${token}` };

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
        {tabBtn('materiais', `Materiais (${detail.files.length + detail.materials.links.length})`)}
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
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-semibold text-white">Arquivos ({detail.files.length})</h4>
            {detail.files.length === 0 ? <p className="text-xs text-white/40">Nenhum arquivo enviado.</p> : (
              <ul className="space-y-1">
                {detail.files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-white/5 py-1.5">
                    <div className="min-w-0">
                      <a href={downloadUrl(f.id)} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{f.fileName}</a>
                      <p className="text-[11px] text-white/40">{CATEGORY_LABEL[f.category] || f.category} · {formatSize(f.fileSize)} · {f.ownerEmail} · {formatDateTime(f.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-semibold text-white">Links ({detail.materials.links.length})</h4>
            {detail.materials.links.length === 0 ? <p className="text-xs text-white/40">Nenhum link.</p> : (
              <ul className="space-y-1">
                {detail.materials.links.map((l, i) => (
                  <li key={i} className="text-sm">
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-prosperus-gold hover:underline break-all">{l.rotulo || l.url}</a>
                    <span className="text-[11px] text-white/40 ml-2">{l.tipo} · {l.url}</span>
                  </li>
                ))}
              </ul>
            )}
            {detail.materials.observacoes && (
              <p className="text-xs text-white/60 whitespace-pre-line border-t border-white/5 pt-2">Observações: {detail.materials.observacoes}</p>
            )}
            <p className="text-[11px] text-white/40">
              {detail.materials_status === 'submitted' ? `"Enviei o que tinha" em ${formatDateTime(detail.materials_submitted_at)}` : 'Ainda não clicou em "Enviei o que tinha".'}
            </p>
          </div>
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
