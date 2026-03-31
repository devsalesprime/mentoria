import React from 'react';

interface PersonalizedFeedbackViewProps {
  feedback: string;
  deliveredAt: string | null;
}

export const PersonalizedFeedbackView: React.FC<PersonalizedFeedbackViewProps> = ({ feedback, deliveredAt }) => {
  const formattedDate = deliveredAt
    ? new Date(deliveredAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="bg-white/5 border border-brand-primary/20 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-brand-primary">&#10003;</span>
          Feedback Personalizado
        </h3>
        {formattedDate && (
          <span className="text-xs text-white/40">Entregue em {formattedDate}</span>
        )}
      </div>

      <div className="prose prose-invert prose-sm max-w-none">
        {feedback.split('\n').map((line, i) => {
          if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
          if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-white mt-4 mb-2">{line.slice(3)}</h2>;
          if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-white/90 mt-3 mb-1">{line.slice(4)}</h3>;
          if (line.startsWith('- ')) return <li key={i} className="text-sm text-white/70 ml-4 list-disc">{renderInline(line.slice(2))}</li>;
          if (line.trim() === '') return <div key={i} className="h-2" />;
          return <p key={i} className="text-sm text-white/70 leading-relaxed">{renderInline(line)}</p>;
        })}
      </div>
    </div>
  );
};

function renderInline(text: string): React.ReactNode {
  // Process links first: [text](url)
  const linkParts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  const elements: React.ReactNode[] = [];

  linkParts.forEach((segment, si) => {
    const linkMatch = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      elements.push(
        <a key={`l${si}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{linkMatch[1]}</a>
      );
      return;
    }
    // Process bold: **text**
    const boldParts = segment.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, bi) => {
      if (bp.startsWith('**') && bp.endsWith('**')) {
        elements.push(<strong key={`b${si}-${bi}`} className="text-white font-semibold">{bp.slice(2, -2)}</strong>);
        return;
      }
      // Process italic: *text* (single asterisk, not double)
      const italicParts = bp.split(/(\*[^*]+\*)/g);
      italicParts.forEach((ip, ii) => {
        if (ip.startsWith('*') && ip.endsWith('*') && !ip.startsWith('**')) {
          elements.push(<em key={`i${si}-${bi}-${ii}`} className="text-white/50">{ip.slice(1, -1)}</em>);
        } else if (ip) {
          elements.push(ip);
        }
      });
    });
  });

  return elements;
}
