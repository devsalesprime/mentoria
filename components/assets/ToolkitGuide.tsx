import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Button } from '../ui/Button';
import type { BrandBrain } from '../../types/pipeline';

const toKebabCase = (str: string): string =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiModelLink {
  name: string;
  url: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: 'operational' | 'content';
  description: string;
  icon: string;
  triggerSentence: string;
  howToUse: string[];
  aiModelLinks: AiModelLink[];
  inputRequirements: string;
  expectedOutput: string;
}

interface ToolkitGuideProps {
  token: string;
  hideTitle?: boolean;
  onSelectTool?: (tool: ToolDefinition) => void;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
  // Operational
  {
    id: 'objection-playbook',
    name: 'Playbook de Objeções',
    category: 'operational',
    icon: '🛡️',
    triggerSentence: 'Use quando uma ligação não fechar',
    description: 'Analise ligações de vendas que não fecharam e gere estratégias de resposta para objeções recorrentes.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Cole a transcrição ou resumo da ligação de vendas que não fechou.',
      'Solicite a análise de objeções e estratégias de resposta.',
      'Salve as estratégias no seu playbook de vendas.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-objection-playbook' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-objection' },
    ],
    inputRequirements: 'Transcrição ou gravação de ligação de vendas que não converteu. Pode ser texto corrido ou em formato de conversa.',
    expectedOutput: 'Análise das objeções identificadas + estratégias de resposta personalizadas ao seu posicionamento.',
  },
  {
    id: 'sales-meeting-feedback',
    name: 'Feedback de Reunião de Vendas',
    category: 'operational',
    icon: '📋',
    triggerSentence: 'Use após cada reunião de vendas',
    description: 'Obtenha um coaching estruturado (Stop/Start/Keep) das suas reuniões de vendas.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Cole a transcrição ou resumo da reunião de vendas.',
      'Solicite a análise Stop/Start/Keep.',
      'Aplique o feedback na próxima reunião.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-sales-feedback' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-sales-feedback' },
    ],
    inputRequirements: 'Gravação ou transcrição de reunião de vendas (fechamento ou apresentação de proposta).',
    expectedOutput: 'Análise Stop/Start/Keep com pontos específicos de melhoria para o seu contexto de venda.',
  },
  {
    id: 'scheduling-call-feedback',
    name: 'Feedback de Ligação de Agendamento',
    category: 'operational',
    icon: '📞',
    triggerSentence: 'Use após ligações de agendamento',
    description: 'Analise suas ligações de agendamento e receba coaching para aumentar a taxa de conversão para reunião.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Cole a transcrição ou resumo da ligação de agendamento.',
      'Solicite a análise e pontos de melhoria.',
      'Pratique as melhorias na próxima ligação.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-scheduling-feedback' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-scheduling-feedback' },
    ],
    inputRequirements: 'Gravação ou transcrição de ligação de agendamento (cold call ou follow-up de agendamento).',
    expectedOutput: 'Análise detalhada com pontos de melhoria e sugestões de roteiro para o seu contexto.',
  },
  {
    id: 'sales-cs-handover',
    name: 'Handover Vendas → CS',
    category: 'operational',
    icon: '🤝',
    triggerSentence: 'Use ao fechar um novo cliente',
    description: 'Gere um documento estruturado de handover para o time de Customer Success ao fechar um cliente.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Cole a transcrição da reunião de fechamento.',
      'Solicite a geração do documento de handover.',
      'Compartilhe com o time de CS antes do onboarding.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-cs-handover' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-cs-handover' },
    ],
    inputRequirements: 'Transcrição ou resumo da reunião de fechamento de vendas com o novo cliente.',
    expectedOutput: 'Documento estruturado de handover com contexto do cliente, expectativas, promessas e próximos passos.',
  },
  // Content
  {
    id: 'short-video-scripts',
    name: 'Scripts de Vídeos Curtos',
    category: 'content',
    icon: '🎬',
    triggerSentence: 'Use quando precisar de conteúdo rápido',
    description: 'Crie scripts de vídeos curtos (Reels, TikTok, Shorts) no seu estilo, a partir de referências que você já aprova.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Forneça de 1 a 5 transcrições de vídeos curtos que você considera referência do seu estilo.',
      'Informe o tema ou o gancho que deseja explorar.',
      'Solicite a geração do script.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-short-videos' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-short-videos' },
    ],
    inputRequirements: '1 a 5 transcrições de vídeos curtos de referência (seus ou de outros criadores que você admira). Opcional: tema específico ou gancho desejado.',
    expectedOutput: 'Scripts de vídeos curtos no estilo das referências, alinhados ao seu posicionamento e Brand Brain.',
  },
  {
    id: 'youtube-scripts',
    name: 'Scripts de YouTube',
    category: 'content',
    icon: '▶️',
    triggerSentence: 'Use para conteúdo longo de autoridade',
    description: 'Produza scripts completos para vídeos longos do YouTube no seu estilo, com estrutura, gancho e CTA.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Forneça de 1 a 5 transcrições de vídeos do YouTube que são referência.',
      'Informe o tema do vídeo e o objetivo (educar, converter, posicionar).',
      'Solicite a geração do script.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-youtube-scripts' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-youtube-scripts' },
    ],
    inputRequirements: '1 a 5 transcrições de vídeos longos de referência. Tema do vídeo e objetivo de conversão.',
    expectedOutput: 'Script completo com gancho, desenvolvimento, pontos de retenção e CTA alinhado ao seu posicionamento.',
  },
  {
    id: 'paid-ad-scripts',
    name: 'Criativos de Anúncios Pagos',
    category: 'content',
    icon: '📢',
    triggerSentence: 'Use quando ativar tráfego pago',
    description: 'Crie scripts de anúncios pagos (Meta, YouTube) baseados em criativos que já performam bem no seu nicho.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Forneça de 1 a 5 transcrições ou descrições de anúncios de referência.',
      'Informe o objetivo do anúncio (topo, meio ou fundo de funil).',
      'Solicite a geração dos scripts.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-ad-scripts' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-ad-scripts' },
    ],
    inputRequirements: '1 a 5 transcrições ou descrições de anúncios pagos de referência. Objetivo e etapa do funil.',
    expectedOutput: 'Scripts de anúncios pagos no estilo das referências, com copy alinhado ao seu posicionamento e ICP.',
  },
  {
    id: 'content-repurposing',
    name: 'Transformar Conteúdo Longo em Curto',
    category: 'content',
    icon: '♻️',
    triggerSentence: 'Use para reciclar conteúdo existente',
    description: 'Extraia carrosséis, posts estáticos e threads a partir de um conteúdo longo que você já produziu.',
    howToUse: [
      'Acesse o modelo de IA pelo link abaixo.',
      'Faça upload do seu Brand Brain como contexto base.',
      'Cole o conteúdo longo (artigo, vídeo transcrito, podcast transcrito).',
      'Informe quais formatos curtos você deseja (carrossel, thread, post estático).',
      'Solicite a extração e adaptação.',
    ],
    aiModelLinks: [
      { name: 'ChatGPT Custom GPT', url: 'https://chatgpt.com/g/placeholder-repurposing' },
      { name: 'Gemini Gem', url: 'https://gemini.google.com/gem/placeholder-repurposing' },
    ],
    inputRequirements: 'Conteúdo longo original (texto completo de artigo, transcrição de vídeo ou podcast). Formatos desejados.',
    expectedOutput: 'Carrosséis, posts estáticos e/ou threads extraídos e adaptados do conteúdo original, no seu tom de voz.',
  },
];

// ─── Brand Brain download helper ──────────────────────────────────────────────

const formatBrandBrainAsMarkdown = (brandBrain: any, mentorName: string): string => {
  const sections = [
    { key: 'section1_offer',       altKey: 'section2_offer',  title: 'Seção 1: Arquitetura da Oferta' },
    { key: 'section2_icp',         altKey: 'section1_icp',    title: 'Seção 2: Perfil do ICP' },
    { key: 'section3_positioning', altKey: '',                 title: 'Seção 3: Posicionamento & Mensagem' },
    { key: 'section4_copy',        altKey: '',                 title: 'Seção 4: Fundamentos de Copy' },
  ];

  let md = `# Brand Brain — ${mentorName}\n\n`;
  md += `_Gerado em ${brandBrain.generatedAt ? new Date(brandBrain.generatedAt).toLocaleDateString('pt-BR') : 'N/A'}_\n\n---\n\n`;

  for (const s of sections) {
    md += `## ${s.title}\n\n`;
    const content = brandBrain[s.key] ?? (s.altKey ? brandBrain[s.altKey] : undefined);
    if (!content) {
      md += '_Seção não disponível._\n\n';
    } else if (typeof content === 'string') {
      md += content + '\n\n';
    } else if (typeof content === 'object' && typeof content.content === 'string') {
      md += content.content + '\n\n';
    } else {
      md += '```json\n' + JSON.stringify(content, null, 2) + '\n```\n\n';
    }
    md += '---\n\n';
  }

  return md;
};

// ─── Guide view ───────────────────────────────────────────────────────────────

interface GuideViewProps {
  tool: ToolDefinition;
  token: string;
  onBack: () => void;
}

export const GuideView: React.FC<GuideViewProps> = ({ tool, token, onBack }) => {
  const [downloading, setDownloading] = useState(false);
  const [bbStatus, setBbStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');
  const [bbData, setBbData] = useState<BrandBrain | null>(null);
  const [mentorName, setMentorName] = useState('Mentor');

  // Fetch Brand Brain status on mount
  React.useEffect(() => {
    const check = async () => {
      try {
        const res = await axios.get('/api/brand-brain', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success && res.data.data?.brandBrainStatus === 'approved') {
          setBbStatus('available');
          setBbData(res.data.data.brandBrain);
          setMentorName(res.data.data?.name || 'Mentor');
        } else {
          setBbStatus('unavailable');
        }
      } catch {
        setBbStatus('unavailable');
      }
    };
    check();
  }, [token]);

  const handleDownloadBrandBrain = useCallback(async () => {
    setDownloading(true);
    try {
      let data = bbData;
      let name = mentorName;
      if (!data) {
        const res = await axios.get('/api/brand-brain', {
          headers: { Authorization: `Bearer ${token}` },
        });
        data = res.data.data?.brandBrain;
        name = res.data.data?.name || 'Mentor';
      }
      if (!data) return;

      const md = formatBrandBrainAsMarkdown(data, name);
      const date = new Date().toISOString().split('T')[0];
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `brand-brain-${toKebabCase(name)}-${date}.md`);
      document.body.appendChild(a);
      a.click();
      a.parentElement?.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  }, [token, bbData, mentorName]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
        >
          ← Voltar
        </Button>
        <span className="text-2xl">{tool.icon}</span>
        <h2 className="text-2xl font-bold text-white">{tool.name}</h2>
      </div>

      <div className="space-y-6">
        {/* COMO USAR */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-4">
            Como Usar
          </h3>
          <ol className="space-y-3">
            {tool.howToUse.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-white/70">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Modelos de IA */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-4">
            Modelos de IA
          </h3>
          <div className="flex flex-wrap gap-3">
            {tool.aiModelLinks.map((link) => (
              <span
                key={link.name}
                title="Em breve"
                className="px-4 py-2 bg-prosperus-gold-dark/10 border border-prosperus-gold-dark/30 text-prosperus-gold-dark rounded-lg text-sm font-semibold opacity-50 cursor-not-allowed select-none"
              >
                {link.name}
              </span>
            ))}
          </div>

          {/* Brand Brain download */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-sm text-white/50 mb-3">
              Faça upload do seu Brand Brain como base de conhecimento nos modelos acima:
            </p>
            <div className="relative inline-block">
              <Button
                variant="secondary"
                onClick={handleDownloadBrandBrain}
                disabled={bbStatus === 'unavailable' || downloading}
                loading={downloading}
              >
                {downloading ? 'Baixando...' : '⬇ Baixar Brand Brain para uso com IA'}
              </Button>
              {bbStatus === 'unavailable' && (
                <p className="text-white/50 text-xs mt-1">Brand Brain ainda não aprovado</p>
              )}
            </div>
            <p className="text-white/20 text-[10px] mt-2 max-w-md">
              O arquivo é baixado em formato .md (Markdown) porque ferramentas de IA processam texto estruturado com muito mais precisão do que PDFs. Isso garante que o ChatGPT, Gemini e outros modelos entendam 100% do contexto.
            </p>
          </div>
        </div>

        {/* O que fornecer */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
            O Que Você Precisa Fornecer
          </h3>
          <p className="text-sm text-white/70">{tool.inputRequirements}</p>
        </div>

        {/* Resultado esperado */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
            Resultado Esperado
          </h3>
          <p className="text-sm text-white/70">{tool.expectedOutput}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const ToolkitGuide: React.FC<ToolkitGuideProps> = ({ token, hideTitle, onSelectTool }) => {
  // Internal fallback when not lifted to parent
  const [internalSelected, setInternalSelected] = useState<ToolDefinition | null>(null);

  const handleSelect = (tool: ToolDefinition) => {
    if (onSelectTool) {
      onSelectTool(tool);
    } else {
      setInternalSelected(tool);
    }
  };

  if (!onSelectTool && internalSelected) {
    return (
      <GuideView
        tool={internalSelected}
        token={token}
        onBack={() => setInternalSelected(null)}
      />
    );
  }

  const operationalTools = TOOLS.filter((t) => t.category === 'operational');
  const contentTools = TOOLS.filter((t) => t.category === 'content');

  const renderToolCard = (tool: ToolDefinition) => (
    <motion.div
      key={tool.id}
      whileHover={{ scale: 1.02 }}
      className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl flex-shrink-0">{tool.icon}</span>
          <h4 className="font-semibold text-white text-sm truncate">{tool.name}</h4>
        </div>
        <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/50">
          {tool.category === 'operational' ? '🔧' : '✍️'}
        </span>
      </div>
      <p className="text-sm text-prosperus-gold-dark/70 font-medium">{tool.triggerSentence}</p>
      <p className="text-sm text-white/50 flex-1">{tool.description}</p>
      {/* AI model quick links */}
      <div className="flex gap-1.5 flex-wrap">
        {tool.aiModelLinks.map((link) => (
          <span
            key={link.name}
            title="Em breve"
            className="px-2 py-0.5 bg-prosperus-gold-dark/10 border border-prosperus-gold-dark/20 text-prosperus-gold-dark rounded text-[10px] font-semibold opacity-50 cursor-not-allowed select-none truncate"
          >
            {link.name}
          </span>
        ))}
      </div>
      <Button
        variant="secondary"
        fullWidth
        onClick={() => handleSelect(tool)}
      >
        Ver Guia Completo
      </Button>
    </motion.div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {!hideTitle && (
        <>
          <h2 className="text-2xl font-bold text-white mb-2">Seu Kit de Escala</h2>
          <p className="text-white/50 text-sm mb-8">
            Você já tem suas primeiras ferramentas. Quando quiser ir mais longe, use seu Brand Brain como base de conhecimento + IA para criar conteúdo e otimizar suas vendas.
          </p>
        </>
      )}

      {/* Operational tools */}
      <div className="mb-8">
        <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
          🔧 Ferramentas Operacionais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {operationalTools.map(renderToolCard)}
        </div>
      </div>

      {/* Content tools */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
          ✍️ Ferramentas de Conteúdo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contentTools.map(renderToolCard)}
        </div>
      </div>
    </div>
  );
};
