/**
 * Consolidated markdown rendering utility.
 * Single source of truth for DOMPurify + marked configuration.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked once
marked.use({ gfm: true, breaks: false });

/** Render markdown to sanitized HTML string. */
export const renderMarkdown = (content: string): string => {
  const html = marked.parse(content, { async: false });
  return DOMPurify.sanitize(html);
};

/** Sanitize raw HTML (no markdown parsing). */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html);
};

/** Render only inline markdown (bold, italic, code, links) to sanitized HTML, without wrapping <p>. */
export const renderInlineMarkdown = (content: string): string => {
  const html = marked.parseInline(content, { async: false });
  return DOMPurify.sanitize(html);
};

/** Markdown to plain text for copy/paste: no headings marks, emphasis, code ticks or table pipes. */
export const markdownToPlainText = (md: string): string => {
  return (md || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*\n?/gm, '')
    .replace(/^[ \t]*\|[ \t]*/gm, '')
    .replace(/[ \t]*\|[ \t]*$/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ' · ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
