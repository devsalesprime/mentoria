import React, { useState } from 'react';
import type { UseScriptFicha, ClubFile, MaterialLink } from '../../hooks/useScriptFicha';
import type { UploadedFile } from '../../types/audio';
import { SCRIPT_MATERIAL_CATEGORIES } from '../../data/script-ficha-fields';
import { AccordionSection } from '../shared/AccordionSection';
import { FileUpload } from '../shared/FileUpload';
import { SectionWarning } from '../shared/SectionWarning';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

interface MateriaisScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
}

const SCRIPT_ACCEPT = 'image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json';
const SCRIPT_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-', 'application/vnd.ms-', 'text/plain', 'text/csv', 'text/markdown', 'application/json'];
const SCRIPT_EXTENSIONS = ['.md', '.csv', '.json', '.txt'];

const LINK_TYPES: { id: MaterialLink['tipo']; label: string }[] = [
  { id: 'drive', label: 'Drive' },
  { id: 'site', label: 'Site' },
  { id: 'plataforma', label: 'Plataforma de conteúdo' },
  { id: 'outro', label: 'Outro' },
];

const CATEGORY_ICONS: Record<string, string> = {
  script_transcricao_venda: '🗣️',
  script_crm: '📊',
  script_apostila_slides: '📚',
  script_proposta_roteiro: '📝',
  script_outros: '📎',
};

function toUploaded(f: ClubFile): UploadedFile {
  return {
    id: f.id,
    userId: f.userId,
    category: f.category,
    fileName: f.fileName,
    filePath: '',
    fileType: f.fileType || undefined,
    fileSize: f.fileSize || undefined,
    createdAt: f.createdAt,
  };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const MateriaisScreen: React.FC<MateriaisScreenProps> = ({ ficha, token, onNavigate }) => {
  const { data, loading, loaded, error, saveMaterials, submitMaterials, setFiles } = ficha;
  const [openCat, setOpenCat] = useState<string | null>(SCRIPT_MATERIAL_CATEGORIES[0].id);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkType, setLinkType] = useState<MaterialLink['tipo']>('drive');
  const [linkError, setLinkError] = useState('');
  const [obs, setObs] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedNow, setSubmittedNow] = useState(false);

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
        <h3 className="font-serif text-2xl text-white">Materiais</h3>
        <p className="text-sm text-white/60 font-sans">{error || 'Esta área ainda não está liberada para o seu acesso. Fale com o Caio.'}</p>
      </div>
    );
  }

  if (!data) return null;

  const files = data.files || [];
  const links = data.materials.links || [];
  const observacoes = obs ?? data.materials.observacoes ?? '';
  const isSubmitted = data.materials_status === 'submitted';
  const totalItems = files.length + links.length;

  const handleFilesChange = (categoryId: string, next: UploadedFile[]) => {
    const byId = Object.fromEntries(files.map((f) => [f.id, f]));
    const others = files.filter((f) => f.category !== categoryId);
    const updated: ClubFile[] = next.map((f) => byId[f.id] ?? {
      id: f.id,
      userId: f.userId,
      category: f.category || categoryId,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      createdAt: f.createdAt,
      mine: true,
    });
    setFiles([...others, ...updated]);
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setLinkError('O link precisa começar com https:// ou http://');
      return;
    }
    setLinkError('');
    saveMaterials({ links: [...links, { url, rotulo: linkLabel.trim(), tipo: linkType }], observacoes });
    setLinkUrl('');
    setLinkLabel('');
  };

  const removeLink = (index: number) => {
    saveMaterials({ links: links.filter((_, i) => i !== index), observacoes });
  };

  const saveObs = () => {
    if (obs === null || obs === data.materials.observacoes) return;
    saveMaterials({ links, observacoes: obs });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    saveObs();
    const ok = await submitMaterials();
    setSubmitting(false);
    if (ok) setSubmittedNow(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      {/* Cabecalho */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
        <h2 className="font-serif text-2xl sm:text-3xl text-white">Materiais</h2>
        <p className="text-sm text-white/70 font-sans leading-relaxed">
          Mande o que você já tem sobre como vende hoje. Quanto mais real, melhor fica o script.
          Tudo que os sócios do clube enviam aparece aqui para todos.
        </p>
        <SectionWarning
          variant="info"
          message={'Acessos de plataforma (login e senha) não entram aqui: mande ao Caio no WhatsApp.\nÁudio e vídeo de reuniões também vão pelo WhatsApp.'}
        />
        {isSubmitted && (
          <p className="text-xs text-green-400 font-sans">
            Você avisou que enviou o que tinha em {formatDate(data.materials_submitted_at)}. Pode continuar adicionando.
          </p>
        )}
      </div>

      {/* Categorias */}
      <div className="space-y-3">
        {SCRIPT_MATERIAL_CATEGORIES.map((cat) => {
          const catFiles = files.filter((f) => f.category === cat.id);
          return (
            <AccordionSection
              key={cat.id}
              title={cat.label}
              icon={CATEGORY_ICONS[cat.id] || '📎'}
              badge="optional"
              badgeLabel={catFiles.length ? `${catFiles.length} arquivo${catFiles.length > 1 ? 's' : ''}` : 'opcional'}
              isComplete={catFiles.length > 0}
              isOpen={openCat === cat.id}
              onToggle={() => setOpenCat((prev) => (prev === cat.id ? null : cat.id))}
            >
              <div className="space-y-3">
                <p className="text-sm text-white/50 font-sans">{cat.hint}</p>
                <FileUpload
                  files={catFiles.map(toUploaded)}
                  onFilesChange={(next) => handleFilesChange(cat.id, next)}
                  category={cat.id}
                  token={token}
                  maxFiles={20}
                  accept={SCRIPT_ACCEPT}
                  allowedMimePrefixes={SCRIPT_MIME_PREFIXES}
                  allowedExtensions={SCRIPT_EXTENSIONS}
                  hint="Máx. 50MB por arquivo · PDF, Word, PowerPoint, Excel, CSV, TXT ou imagem"
                  canDelete={(f) => catFiles.find((c) => c.id === f.id)?.mine !== false}
                  fileMeta={(f) => {
                    const c = catFiles.find((x) => x.id === f.id);
                    if (!c || c.mine) return null;
                    return `enviado por ${c.ownerName || c.ownerEmail || 'sócio'}`;
                  }}
                />
              </div>
            </AccordionSection>
          );
        })}
      </div>

      {/* Links */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <h3 className="font-serif text-xl text-white">Links</h3>
        <p className="text-sm text-white/50 font-sans">Pasta no Drive, site, plataforma de conteúdo. Só o link, sem senha.</p>
        <div className="flex flex-wrap gap-2">
          {LINK_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setLinkType(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-sans border transition ${
                linkType === t.id ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark' : 'border-white/20 text-white/70 hover:border-prosperus-gold-dark/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
            placeholder="https://"
            aria-label="Link"
            className="flex-1 bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none"
          />
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
            placeholder="Nome (opcional)"
            aria-label="Nome do link"
            className="sm:w-48 bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none"
          />
          <Button variant="secondary" size="md" onClick={addLink} disabled={!linkUrl.trim()}>Adicionar</Button>
        </div>
        {linkError && <p className="text-xs text-red-400 font-sans">{linkError}</p>}
        {links.length > 0 && (
          <ul className="space-y-2">
            {links.map((l, i) => (
              <li key={`${l.url}-${i}`} className="flex items-center justify-between gap-3 p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg">
                <div className="min-w-0">
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-sm text-prosperus-gold-light hover:underline font-sans truncate block">
                    {l.rotulo || l.url}
                  </a>
                  <p className="text-[11px] text-white/40 font-sans truncate">{LINK_TYPES.find((t) => t.id === l.tipo)?.label || 'Outro'} · {l.url}</p>
                </div>
                <Button variant="icon" size="xs" onClick={() => removeLink(i)} aria-label={`Remover ${l.rotulo || l.url}`} className="!text-white/50 hover:!text-red-400 flex-shrink-0">✕</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Observacoes */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <h3 className="font-serif text-xl text-white">Alguma observação?</h3>
        <textarea
          value={observacoes}
          onChange={(e) => setObs(e.target.value)}
          onBlur={saveObs}
          rows={3}
          placeholder="Ex.: a gravação da última reunião de venda eu mando pelo WhatsApp."
          aria-label="Observações"
          className="w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none resize-y"
        />
      </div>

      {/* Enviar */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/70 font-sans">
            {totalItems === 0 ? 'Nada enviado ainda. Sem material também dá: a ficha vem do que já temos.' : `${files.length} arquivo${files.length === 1 ? '' : 's'} e ${links.length} link${links.length === 1 ? '' : 's'} do clube.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {onNavigate && (
              <Button variant="ghost" size="md" onClick={() => onNavigate('script_ficha')}>Ir para a ficha</Button>
            )}
            <Button variant="primary" size="lg" onClick={handleSubmit} loading={submitting}>
              {isSubmitted ? 'Enviei mais coisas' : 'Enviei o que tinha'}
            </Button>
          </div>
        </div>
        {submittedNow && (
          <p className="text-xs text-green-400 font-sans">Recebido. O Caio avisa quando a ficha estiver pronta para revisar.</p>
        )}
      </div>
    </div>
  );
};
