import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ParsedSubsection, PROSE_CLASSES, htmlToMarkdown, wrapSuggestionGroups } from '../../utils/brand-brain-parser';
import { Button } from '../ui/Button';

export interface SubsectionCardProps {
  sub: ParsedSubsection;
  editable?: boolean;
  onEdit?: (newBody: string) => void;
  onDelete?: () => void;
}

// WYSIWYG editor ref handle — exposes getMarkdown() for save-time conversion
export interface RichEditorHandle {
  getMarkdown: () => string;
}

// WYSIWYG editor — contentEditable with toolbar
// HTML->markdown conversion only happens at save time (via ref.getMarkdown()),
// NOT on every keystroke. This avoids round-trip corruption.
export const RichEditor = forwardRef<RichEditorHandle, {
  initialValue: string;
  onContentChange?: (hasContent: boolean) => void;
  onSave?: () => void;
  onCancel?: () => void;
  height?: string;
  showActions?: boolean;
  placeholder?: string;
}>(({ initialValue, onContentChange, onSave, onCancel, height = 'min-h-[160px]', showActions = true, placeholder }, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Expose getMarkdown() to parent — converts HTML->markdown only when called
  useImperativeHandle(ref, () => ({
    getMarkdown: () => htmlToMarkdown(editorRef.current?.innerHTML || ''),
  }));

  // Convert markdown -> HTML only on mount
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = initialValue.trim() ? DOMPurify.sanitize(marked.parse(initialValue) as string) : '';
    el.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifyContent = () => {
    if (onContentChange) {
      const text = editorRef.current?.innerText?.trim() || '';
      onContentChange(text.length > 0);
    }
  };

  const execCmd = (cmd: string) => {
    document.execCommand(cmd, false);
    notifyContent();
  };

  // Auto-detect list shortcuts: "1. " -> ordered list, "- " or "* " -> unordered list
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== ' ') return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const textBefore = (node.textContent || '').substring(0, range.startOffset);

    // "N." at start of line -> ordered list
    if (/^\d+\.$/.test(textBefore.trim())) {
      e.preventDefault();
      const deleteRange = document.createRange();
      deleteRange.setStart(node, 0);
      deleteRange.setEnd(node, range.startOffset);
      sel.removeAllRanges();
      sel.addRange(deleteRange);
      document.execCommand('delete', false);
      document.execCommand('insertOrderedList', false);
      notifyContent();
      return;
    }

    // "-" or "*" at start of line -> unordered list
    if (/^[-*]$/.test(textBefore.trim())) {
      e.preventDefault();
      const deleteRange = document.createRange();
      deleteRange.setStart(node, 0);
      deleteRange.setEnd(node, range.startOffset);
      sel.removeAllRanges();
      sel.addRange(deleteRange);
      document.execCommand('delete', false);
      document.execCommand('insertUnorderedList', false);
      notifyContent();
      return;
    }
  };

  const toolbar = (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/5 bg-white/5">
      <Button
        variant="icon"
        type="button"
        onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }}
        className="text-xs font-bold"
        title="Negrito"
      >B</Button>
      <Button
        variant="icon"
        type="button"
        onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }}
        className="text-xs italic"
        title="Italico"
      >I</Button>
      <div className="w-px h-4 bg-white/10 mx-1" />
      <Button
        variant="icon"
        type="button"
        onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }}
        className="text-[11px]"
        title="Lista com marcadores"
      >&#8226; Lista</Button>
      <Button
        variant="icon"
        type="button"
        onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }}
        className="text-[11px]"
        title="Lista numerada"
      >1. Lista</Button>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="border border-prosperus-gold-dark/20 rounded-lg overflow-hidden bg-black/20">
        {toolbar}
        <div
          ref={editorRef}
          contentEditable
          onInput={notifyContent}
          onKeyDown={handleKeyDown}
          data-placeholder={placeholder || 'Escreva aqui...'}
          className={`w-full bg-transparent px-4 py-3 text-sm text-white/70 ${height} focus:outline-none text-[13px] leading-relaxed overflow-y-auto ${PROSE_CLASSES} [&_b]:text-prosperus-gold-dark [&_b]:font-semibold [&_li]:text-white/70 empty:before:content-[attr(data-placeholder)] empty:before:text-white/50 empty:before:pointer-events-none`}
        />
      </div>
      {showActions && onCancel && onSave && (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={onCancel} className="text-white/50 hover:text-white/60">Cancelar</Button>
          <Button variant="outline" size="sm" onClick={onSave} className="bg-prosperus-gold-dark/20 border-prosperus-gold-dark/30 text-prosperus-gold-dark hover:bg-prosperus-gold-dark/30">Salvar</Button>
        </div>
      )}
    </div>
  );
});
RichEditor.displayName = 'RichEditor';

// ─── Table parsing helpers ─────────────────────────────────────────────────

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Returns true if the body text is a markdown table (has pipe-separated rows). */
function isMarkdownTable(body: string): boolean {
  return /\|[\s-]+\|/.test(body);
}

/** Parse a markdown table string into headers + data rows. */
function parseMarkdownTable(body: string): ParsedTable {
  const lines = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());

  // Line 0 = header, Line 1 = separator (--), Lines 2+ = data rows
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  return { headers, rows };
}

/** Reconstruct a markdown table from parsed data. */
function tableToMarkdown(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(row => {
    // Pad or trim row cells to match header column count
    const padded = [...row];
    while (padded.length < headers.length) padded.push('');
    return `| ${padded.slice(0, headers.length).join(' | ')} |`;
  });
  return [headerRow, separator, ...dataRows].join('\n');
}

// ─── Table Editor component ────────────────────────────────────────────────

interface TableEditorProps {
  initialBody: string;
  onSave: (newBody: string) => void;
  onCancel: () => void;
}

const TableEditor: React.FC<TableEditorProps> = ({ initialBody, onSave, onCancel }) => {
  const parsed = parseMarkdownTable(initialBody);
  const [headers] = useState<string[]>(parsed.headers);
  const [rows, setRows] = useState<string[][]>(parsed.rows.length > 0 ? parsed.rows : []);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<number | null>(null);

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    setRows(prev => {
      const updated = prev.map(r => [...r]);
      while (updated[rowIdx].length <= colIdx) updated[rowIdx].push('');
      updated[rowIdx][colIdx] = value;
      return updated;
    });
  };

  const handleDeleteRow = (rowIdx: number) => {
    if (confirmDeleteRow === rowIdx) {
      setRows(prev => prev.filter((_, i) => i !== rowIdx));
      setConfirmDeleteRow(null);
    } else {
      setConfirmDeleteRow(rowIdx);
      // Auto-cancel confirmation after 3s
      setTimeout(() => setConfirmDeleteRow(cur => (cur === rowIdx ? null : cur)), 3000);
    }
  };

  const handleAddRow = () => {
    const emptyRow = Array(headers.length).fill('');
    setRows(prev => [...prev, emptyRow]);
  };

  const handleSave = () => {
    const markdown = tableToMarkdown(headers, rows);
    onSave(markdown);
  };

  if (headers.length === 0) {
    // Fallback: if parsing failed, show message
    return (
      <div className="space-y-2">
        <p className="text-xs text-white/40 italic">Não foi possível analisar a estrutura da tabela.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={onCancel} className="text-white/50 hover:text-white/60">Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/40">
        Edite as células diretamente. Use o botão "x" para remover uma linha, "+" para adicionar.
      </p>
      <div className="overflow-x-auto rounded-lg border border-prosperus-gold-dark/20 bg-black/20">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider font-bold text-prosperus-gold-dark bg-prosperus-gold-dark/10 border-b border-prosperus-gold-dark/20"
                >
                  {h}
                </th>
              ))}
              {/* Extra column for row controls */}
              <th className="px-2 py-2.5 bg-prosperus-gold-dark/10 border-b border-prosperus-gold-dark/20 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-white/5 last:border-b-0">
                {headers.map((_, colIdx) => (
                  <td key={colIdx} className="px-1 py-1 align-top">
                    <textarea
                      value={row[colIdx] ?? ''}
                      onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                      rows={2}
                      className="w-full bg-transparent px-2 py-1.5 text-[13px] text-white/70 leading-relaxed resize-none focus:outline-none focus:bg-white/5 rounded transition-colors placeholder:text-white/20"
                      placeholder="..."
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-center align-middle">
                  {confirmDeleteRow === rowIdx ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-red-400 whitespace-nowrap">Remover?</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDeleteRow(rowIdx)}
                          className="text-[10px] px-1.5 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                          title="Confirmar remoção"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmDeleteRow(null)}
                          className="text-[10px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-white/50 rounded transition-colors"
                          title="Cancelar"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDeleteRow(rowIdx)}
                      className="text-white/30 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/10"
                      title="Remover linha"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <button
        onClick={handleAddRow}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-prosperus-gold-dark/20 hover:border-prosperus-gold-dark/40 rounded-lg text-[12px] text-prosperus-gold-dark/50 hover:text-prosperus-gold-dark transition-colors"
      >
        <span className="text-base leading-none">+</span>
        <span>Adicionar linha</span>
      </button>

      {/* Save / Cancel */}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="xs" onClick={onCancel} className="text-white/50 hover:text-white/60">Cancelar</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="bg-prosperus-gold-dark/20 border-prosperus-gold-dark/30 text-prosperus-gold-dark hover:bg-prosperus-gold-dark/30"
        >
          Salvar
        </Button>
      </div>
    </div>
  );
};

// ─── SubsectionCard ────────────────────────────────────────────────────────

export const SubsectionCard: React.FC<SubsectionCardProps> = ({ sub, editable, onEdit, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<RichEditorHandle>(null);

  const isTable = isMarkdownTable(sub.body);

  const handleSave = () => {
    const md = editorRef.current?.getMarkdown() || '';
    if (onEdit && md.trim()) {
      onEdit(md.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleTableSave = (newBody: string) => {
    if (onEdit && newBody.trim()) {
      onEdit(newBody.trim());
    }
    setEditing(false);
  };

  const editControls = editable && !editing ? (
    // Desktop: opacity-0 revealed on group hover; Touch devices: opacity-60 always visible (no :hover support)
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity ml-auto flex-shrink-0">
      <Button
        variant="icon"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="hover:bg-white/10 text-white/50 hover:text-prosperus-gold-dark"
        title="Editar"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </Button>
      {onDelete && (
        <Button
          variant="icon"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hover:bg-red-500/10 text-white/50 hover:text-red-400"
          title="Remover topico"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </Button>
      )}
    </div>
  ) : null;

  // Cluster mode
  if (sub.clusterItems && sub.clusterItems.length > 0) {
    return (
      <div className="group bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
          <span className="text-lg flex-shrink-0">{sub.icon}</span>
          <h4 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">{sub.title}</h4>
          {editControls}
        </div>
        {editing ? (
          <div className="px-4 pb-4">
            <RichEditor ref={editorRef} initialValue={sub.body} onSave={handleSave} onCancel={handleCancel} height="h-48" />
          </div>
        ) : (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {sub.clusterItems.map((item, i) => {
              const itemHtml = DOMPurify.sanitize(marked.parse(item) as string);
              return (
                <div
                  key={i}
                  className={`bg-white/5 border border-white/5 rounded-lg px-4 py-3 ${PROSE_CLASSES}`}
                  dangerouslySetInnerHTML={{ __html: itemHtml }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="bg-white/5 border border-prosperus-gold-dark/20 rounded-xl overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
          <span className="text-lg flex-shrink-0">{sub.icon}</span>
          <h4 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">{sub.title}</h4>
        </div>
        <div className="px-5 pb-4">
          {isTable ? (
            <TableEditor
              initialBody={sub.body}
              onSave={handleTableSave}
              onCancel={handleCancel}
            />
          ) : (
            <RichEditor ref={editorRef} initialValue={sub.body} onSave={handleSave} onCancel={handleCancel} />
          )}
        </div>
      </div>
    );
  }

  const rawHtml = DOMPurify.sanitize(marked.parse(sub.body) as string);
  // Apply suggestion-group wrapping for 1C Sugestoes de Otimizacao and similar patterns
  const isSuggestionSection = /sugest|otimiza/i.test(sub.title);
  const html = isSuggestionSection ? wrapSuggestionGroups(rawHtml) : rawHtml;

  return (
    <div className="group bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/10 transition-colors">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2.5">
        <span className="text-lg flex-shrink-0">{sub.icon}</span>
        <h4 className="text-sm font-bold text-prosperus-gold-dark tracking-wide uppercase">{sub.title}</h4>
        {editControls}
      </div>
      <div
        className={`px-5 pb-5 pt-2 overflow-x-auto ${PROSE_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
