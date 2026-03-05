import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { SECTIONS, getSectionContent } from '../../utils/brand-brain-constants';

export const generatePdfFromBrandBrain = async (brandBrain: Record<string, any>, mentorName: string) => {
  const html2pdf = (await import('html2pdf.js')).default;

  const sectionsHtml = SECTIONS.map((s) => {
    const content = getSectionContent(brandBrain, s);
    let html = '';
    if (!content) {
      html = '<p style="color:#999;font-style:italic;">Seção não disponível.</p>';
    } else if (typeof content === 'string') {
      html = DOMPurify.sanitize(marked.parse(content) as string);
    } else if (typeof content === 'object' && typeof content.content === 'string') {
      html = DOMPurify.sanitize(marked.parse(content.content) as string);
    } else {
      html = '<pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:11px;overflow:auto;">' + JSON.stringify(content, null, 2) + '</pre>';
    }
    return `<div style="margin-bottom:32px;"><h2 style="color:#CA9A43;font-size:18px;border-bottom:2px solid #CA9A43;padding-bottom:8px;margin-bottom:16px;">${s.title}</h2>${html}</div>`;
  }).join('');

  const date = brandBrain.generatedAt ? new Date(brandBrain.generatedAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

  const fullHtml = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:40px 24px;">
      <div style="text-align:center;margin-bottom:40px;">
        <h1 style="font-size:28px;color:#CA9A43;margin-bottom:4px;">Brand Brain</h1>
        <p style="font-size:14px;color:#666;">${mentorName} — ${date}</p>
      </div>
      ${sectionsHtml}
      <div style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #eee;">
        <p style="font-size:11px;color:#999;">Documento gerado pela plataforma Prosperus</p>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  const kebab = mentorName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  await html2pdf().set({
    margin: [10, 10, 10, 10],
    filename: `brand-brain-${kebab}-${new Date().toISOString().split('T')[0]}.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(container).save();

  document.body.removeChild(container);
};

export const downloadAsMarkdown = (brandBrain: Record<string, any>, mentorName: string) => {
  let md = `# Brand Brain — ${mentorName}\n\n`;
  const date = brandBrain.generatedAt ? new Date(brandBrain.generatedAt).toLocaleDateString('pt-BR') : 'N/A';
  md += `_Gerado em ${date}_\n\n---\n\n`;

  for (const s of SECTIONS) {
    md += `## ${s.title}\n\n`;
    const content = getSectionContent(brandBrain, s);
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

  const kebab = mentorName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', `brand-brain-${kebab}-${new Date().toISOString().split('T')[0]}.md`);
  document.body.appendChild(a);
  a.click();
  a.parentElement?.removeChild(a);
  URL.revokeObjectURL(url);
};
