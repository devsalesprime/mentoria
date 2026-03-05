import DOMPurify from 'dompurify';

// ─── Dashboard subsection parsing ──────────────────────────────────────────

export interface ParsedSubsection {
  title: string;
  body: string;
  icon: string;
  fullWidth?: boolean;
  clusterItems?: string[];
}

export const ICON_MAP: Record<string, string> = {
  // PT-BR keywords (from actual BB generation output)
  'diagnóstico': '🔍', 'diagnostico': '🔍',
  'swot': '📊', 'forças': '💪', 'forcas': '💪', 'fraqueza': '⚠️',
  'sugest': '💡', 'otimiza': '⚡', 'recomenda': '💡',
  'arquitetura de preço': '💲', 'preço': '💲', 'preco': '💲', 'pagamento': '💲', 'ancoragem': '💲',
  'demografi': '👥', 'perfil profissional': '💼', 'profissional': '💼',
  'cluster': '🔥', 'dor': '🔥', 'pain': '🔥',
  'objetivo': '🎯', 'aspiração': '🎯', 'aspiracao': '🎯', 'meta': '🎯',
  'driver': '💎', 'emociona': '💎',
  'citaç': '💬', 'citac': '💬', 'voz': '💬', 'quote': '💬', 'client': '💬',
  'medo': '⚡', 'frustra': '⚡', 'receio': '⚡', 'fear': '⚡',
  'psicográf': '🧠', 'psicograf': '🧠', 'insight': '🧠', 'crença': '🧠', 'crenca': '🧠',
  'jornada': '🗺️', 'journey': '🗺️',
  'anti-avatar': '🚫', 'anti avatar': '🚫', 'avatar': '🚫',
  'consciência': '📡', 'consciencia': '📡', 'awareness': '📡',
  'sofisticação': '📡', 'sofisticacao': '📡', 'sophistication': '📡',
  'grande ideia': '💡', 'big idea': '💡',
  'metáfora': '🎭', 'metafora': '🎭', 'metaphor': '🎭',
  'ump': '🔬', 'ums': '🔬', 'mecanismo': '🔬', 'mechanism': '🔬',
  'narrativa de origem': '📖', 'história do guru': '📖', 'historia do guru': '📖', 'narrativa de descoberta': '📖', 'guru': '📖', 'story': '📖',
  'pitch': '🎤', 'elevador': '🎤', 'elevator': '🎤',
  'diferencia': '⚔️', 'differentiation': '⚔️',
  'reversão de risco': '🛡️', 'reversao de risco': '🛡️', 'garantia': '🛡️', 'risk': '🛡️', 'reversal': '🛡️',
  'transformação': '✨', 'transformacao': '✨', 'transformation': '✨',
  'posicionamento': '📌', 'position': '📌',
  'headline': '📰', 'manchete': '📰', 'título': '📰',
  'hook': '🪝', 'gancho': '🪝',
  'cta': '🔘', 'chamada': '🔘',
  'matéria': '🧱', 'materia': '🧱', 'raw': '🧱', 'strategic': '🧱', 'fundament': '🧱',
  'descricao completa da oferta': '📦', 'descricao completa': '📦', '1e': '📦',
  'oferta': '📦', 'offer': '📦', 'entrega': '📦', 'deliver': '📦',
  'valor': '💰', 'value': '💰', 'stack': '💰',
  'bônus': '🎁', 'bonus': '🎁',
  'ausente': '⚠️', 'missing': '⚠️',
  'ameaça': '🚨', 'threat': '🚨', 'oportunidade': '🌟', 'opportunity': '🌟',
  'prova social': '⭐', 'testemunho': '⭐', 'depoimento': '⭐',
  'objeç': '🛡️', 'objec': '🛡️',
  'cadeia de crença': '🔗', 'belief': '🔗',
  'copy': '✍️', 'conteúdo': '📋', 'conteudo': '📋',
  'resumo': '📑', 'sumário': '📑', 'sumario': '📑',
  'validação': '✅', 'validacao': '✅',
  'análise': '📊', 'analise': '📊',
  'elemento': '📋',
};

// Curated emoji palette for the emoji picker
export const EMOJI_PALETTE = [
  '📦', '🎯', '📌', '✍️', '🔍', '📊', '💡', '💲',
  '👥', '💼', '🔥', '💎', '💬', '⚡', '🧠', '🗺️',
  '🚫', '📡', '🎭', '🔬', '📖', '🎤', '⚔️', '🛡️',
  '✨', '📰', '🪝', '🔘', '🧱', '💰', '🎁', '⭐',
  '🔗', '📑', '✅', '💪', '⚠️', '🚨', '🌟', '📋',
];

export function detectIcon(title: string): string {
  const lower = title.toLowerCase();
  // Try exact-ish matches first (longer keys = more specific)
  const sorted = Object.entries(ICON_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, icon] of sorted) {
    if (lower.includes(keyword)) return icon;
  }
  // Fallback: try without accents
  const stripped = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [keyword, icon] of sorted) {
    const kwStripped = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (stripped.includes(kwStripped)) return icon;
  }
  return '📋';
}

export function parseSubsections(text: string): ParsedSubsection[] {
  if (!text) return [];
  const raw = typeof text === 'string' ? text : '';
  if (!raw.trim()) return [];

  // Remove top-level section header, disclaimer blockquote, and horizontal rules
  // Also strip the AI closing note from legacy Brand Brains (section4_copy footer)
  const CLOSING_NOTE_REGEX = /\*?Fim do Brand Brain\.?\s*Este documento[^*]*(?:VSL\)?\.?\*?)\s*$/s;
  const cleaned = raw
    .replace(/^#{1,3}\s+(?:BRAND BRAIN|SEÇÃO \d|SECTION \d).*$/gim, '')
    .replace(/^>\s*\*\*Esta é uma visão.*?\*\*$/gm, '')
    .replace(/^---$/gm, '')
    .replace(CLOSING_NOTE_REGEX, '')
    .trim();

  // Split by H4 (####) or bold-colon headers (**Title:**) at start of line
  // Requires colon (inside or outside bold) so plain **bold** in body text doesn't create subsections
  // Exclude numbered bold items (**1. ...**) from creating new sections — they're sub-items
  const parts: ParsedSubsection[] = [];
  const regex = /(?:^|\n)(?:#{4}\s+(.+)|(?:\*\*(?!\d+\.\s)([^*]+?):\*\*|\*\*(?!\d+\.\s)([^*]+?)\*\*:)\s*)/g;
  let lastIndex = 0;
  let lastTitle = '';
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    if (lastTitle && lastIndex < match.index) {
      const body = cleaned.substring(lastIndex, match.index).trim();
      if (body) {
        parts.push({ title: lastTitle, body, icon: detectIcon(lastTitle) });
      }
    }
    lastTitle = (match[1] || match[2] || match[3] || '').trim();
    lastIndex = match.index + match[0].length;
  }

  // Last section
  if (lastTitle) {
    const body = cleaned.substring(lastIndex).trim();
    if (body) {
      parts.push({ title: lastTitle, body, icon: detectIcon(lastTitle) });
    }
  }

  // If no subsections parsed, return the whole thing as one card
  if (parts.length === 0 && cleaned.trim()) {
    parts.push({ title: 'Conteúdo', body: cleaned.trim(), icon: '📋' });
  }

  // Post-process: detect fullWidth cards (tables, clusters)
  for (const part of parts) {
    // Tables should span the full width
    if (/\|[\s-]+\|/.test(part.body)) {
      part.fullWidth = true;
    }
    // Cluster/Top N patterns: render as horizontal columns
    if (/cluster|top\s+\d/i.test(part.title)) {
      part.fullWidth = true;
      // Split body into individual cluster items (e.g. "* **1. Title:**")
      const clusterRegex = /(?:^|\n)\*\s+\*\*\d+\.\s/g;
      const matches = [...part.body.matchAll(clusterRegex)];
      if (matches.length >= 2) {
        const items: string[] = [];
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index!;
          const end = i + 1 < matches.length ? matches[i + 1].index! : part.body.length;
          items.push(part.body.substring(start, end).trim());
        }
        part.clusterItems = items;
      }
    }
  }

  // Move cluster cards to the end so they appear at the bottom of the section
  const clusters = parts.filter(p => p.clusterItems);
  const nonClusters = parts.filter(p => !p.clusterItems);
  return [...nonClusters, ...clusters];
}

// Helper: reconstruct markdown from parsed subsections
export const reconstructMarkdown = (subsections: ParsedSubsection[]): string => {
  return subsections.map(s => `#### ${s.title}\n${s.body}`).join('\n\n');
};

export const renderJsonAsHtml = (obj: Record<string, any>, depth = 0): string => {
  const entries = Object.entries(obj).filter(([k]) => k !== 'content');
  if (entries.length === 0) return '';
  return entries.map(([key, value]) => {
    const label = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return `<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
        <p style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">${DOMPurify.sanitize(label)}</p>
        <p style="font-size:14px;color:rgba(255,255,255,0.8);line-height:1.5;">${DOMPurify.sanitize(String(value))}</p>
      </div>`;
    }
    if (Array.isArray(value)) {
      const li = value.map(v => `<li style="color:rgba(255,255,255,0.7);font-size:13px;padding:4px 0;">${DOMPurify.sanitize(typeof v === 'string' ? v : JSON.stringify(v))}</li>`).join('');
      return `<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
        <p style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">${DOMPurify.sanitize(label)}</p>
        <ul style="list-style:disc;padding-left:20px;margin:0;">${li}</ul>
      </div>`;
    }
    if (typeof value === 'object' && value !== null) {
      return `<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
        <p style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">${DOMPurify.sanitize(label)}</p>
        ${renderJsonAsHtml(value, depth + 1)}
      </div>`;
    }
    return '';
  }).join('');
};

export const PROSE_CLASSES = `text-sm text-white/70 leading-relaxed
  [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_ul]:ml-0 [&_ul]:list-none [&_ul]:pl-0
  [&_ol]:space-y-1.5 [&_ol]:mt-2 [&_ol]:ml-0 [&_ol]:list-decimal [&_ol]:pl-5
  [&_li]:relative [&_li]:text-white/70 [&_li]:text-[13px] [&_li]:leading-relaxed
  [&_ul_li]:pl-4
  [&_ul_li]:before:content-[''] [&_ul_li]:before:absolute [&_ul_li]:before:left-0 [&_ul_li]:before:top-[9px] [&_ul_li]:before:w-1.5 [&_ul_li]:before:h-1.5 [&_ul_li]:before:rounded-full [&_ul_li]:before:bg-prosperus-gold-dark/50
  [&_ol_li]:pl-1 [&_ol_li]:marker:text-prosperus-gold-dark/60 [&_ol_li]:marker:font-semibold
  [&_strong]:text-prosperus-gold-dark [&_strong]:font-semibold
  [&_em]:text-white/50
  [&_p]:mb-2 [&_p]:text-[13px]
  [&_blockquote]:border-l-2 [&_blockquote]:border-prosperus-gold-dark/40 [&_blockquote]:bg-prosperus-gold-dark/[0.04] [&_blockquote]:rounded-r-lg [&_blockquote]:py-3 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-white/60 [&_blockquote]:italic
  [&_table]:w-full [&_table]:border-collapse [&_table]:my-3
  [&_th]:bg-prosperus-gold-dark/10 [&_th]:text-prosperus-gold-dark [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-bold [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:border-b [&_th]:border-prosperus-gold-dark/20
  [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px] [&_td]:text-white/70 [&_td]:border-b [&_td]:border-white/5
  [&_tr:last-child_td]:border-b-0
  [&_hr]:border-white/5 [&_hr]:my-4
  [&_h1]:text-base [&_h1]:text-prosperus-gold-dark [&_h1]:font-bold [&_h1]:mb-2
  [&_h2]:text-sm [&_h2]:text-prosperus-gold-dark [&_h2]:font-bold [&_h2]:mb-2
  [&_h3]:text-sm [&_h3]:text-white/70 [&_h3]:font-semibold [&_h3]:mb-1
  [&_.suggestion-group]:rounded-lg [&_.suggestion-group]:border [&_.suggestion-group]:border-white/10 [&_.suggestion-group]:bg-white/[0.03] [&_.suggestion-group]:px-4 [&_.suggestion-group]:py-3 [&_.suggestion-group]:mb-3`;

/**
 * Post-process HTML for the 1C Sugestoes de Otimizacao pattern.
 * Each suggestion is a group of 3 consecutive bullet items containing <strong> labels.
 * This wraps every 3-item group in a <div class="suggestion-group"> for visual separation.
 * Safe to call on any HTML — only acts on <ul> elements with multiples of 3 <li> items
 * where each <li> starts with a <strong> label.
 */
export function wrapSuggestionGroups(html: string): string {
  // Match a <ul>...</ul> block and check if all <li>s start with <strong>
  return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (match, inner) => {
    // Extract individual <li> items
    const liMatches = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)];
    if (liMatches.length === 0) return match;

    // Check if at least 2/3 of the items contain a <strong> label (the triplet pattern)
    const strongCount = liMatches.filter(m => /<strong>/.test(m[1])).length;
    if (strongCount < Math.ceil(liMatches.length * 0.5)) return match;

    // Group into chunks of 3 (BB suggestion triplet: Portuguese, English, Hybrid)
    const groupSize = 3;
    let result = '';
    for (let i = 0; i < liMatches.length; i += groupSize) {
      const chunk = liMatches.slice(i, i + groupSize);
      const chunkHtml = chunk.map(m => `<li>${m[1]}</li>`).join('');
      result += `<div class="suggestion-group"><ul>${chunkHtml}</ul></div>`;
    }
    return result;
  });
}

// HTML -> Markdown converter for contentEditable output
export const htmlToMarkdown = (html: string): string => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  if (!root) return '';

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';

    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Recursive children
    const inner = Array.from(el.childNodes).map(walk).join('');

    switch (tag) {
      case 'b':
      case 'strong':
        return inner.trim() ? `**${inner.trim()}**` : '';
      case 'i':
      case 'em':
        return inner.trim() ? `*${inner.trim()}*` : '';
      case 'ul': {
        const items = Array.from(el.querySelectorAll(':scope > li'))
          .map(li => `- ${walk(li).trim()}`)
          .filter(s => s !== '- ');
        return '\n' + items.join('\n') + '\n';
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll(':scope > li'))
          .map((li, i) => `${i + 1}. ${walk(li).trim()}`)
          .filter(s => !s.endsWith('. '));
        return '\n' + items.join('\n') + '\n';
      }
      case 'li':
        return inner;
      case 'br':
        return '\n';
      case 'p':
        return inner.trim() ? inner.trim() + '\n\n' : '';
      case 'div':
        // Chrome wraps each line in a div — use double newline for paragraph separation
        return inner.trim() ? inner.trim() + '\n\n' : '';
      case 'span': {
        // Chrome sometimes uses <span style> instead of <b>/<i> for execCommand
        const style = (el as HTMLElement).style;
        let result = inner;
        const isBold = style.fontWeight === 'bold' || style.fontWeight === 'bolder' || parseInt(style.fontWeight) >= 600;
        const isItalic = style.fontStyle === 'italic';
        if (isBold && isItalic) {
          result = inner.trim() ? `***${inner.trim()}***` : '';
        } else if (isBold) {
          result = inner.trim() ? `**${inner.trim()}**` : '';
        } else if (isItalic) {
          result = inner.trim() ? `*${inner.trim()}*` : '';
        }
        return result;
      }
      case 'blockquote':
        return inner.trim() ? '> ' + inner.trim().split('\n').join('\n> ') + '\n\n' : '';
      case 'h1':
        return `# ${inner.trim()}\n\n`;
      case 'h2':
        return `## ${inner.trim()}\n\n`;
      case 'h3':
        return `### ${inner.trim()}\n\n`;
      case 'h4':
        return `#### ${inner.trim()}\n\n`;
      case 'table': {
        // Convert HTML table -> markdown table
        const rows: string[][] = [];
        let hasHeader = false;
        el.querySelectorAll('tr').forEach((tr, i) => {
          const cells: string[] = [];
          tr.querySelectorAll('td, th').forEach(cell => {
            cells.push(walk(cell).trim().replace(/\|/g, '\\|'));
          });
          if (cells.length > 0) rows.push(cells);
          if (i === 0 && tr.querySelector('th')) hasHeader = true;
        });
        if (rows.length === 0) return inner;
        const colCount = Math.max(...rows.map(r => r.length));
        const pad = (row: string[]) => { const r = [...row]; while (r.length < colCount) r.push(''); return r; };
        let md = '\n';
        md += '| ' + pad(rows[0]).join(' | ') + ' |\n';
        md += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
        for (let i = 1; i < rows.length; i++) {
          md += '| ' + pad(rows[i]).join(' | ') + ' |\n';
        }
        return md + '\n';
      }
      case 'thead':
      case 'tbody':
      case 'tr':
      case 'th':
      case 'td':
        return inner;
      default:
        return inner;
    }
  };

  return walk(root)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Strip zero-width chars from contentEditable
    .replace(/\n{3,}/g, '\n\n')  // Collapse excessive newlines
    .trim();
};
