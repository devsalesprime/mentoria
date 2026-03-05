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
