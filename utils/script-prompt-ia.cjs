/**
 * "Peça para a sua IA preencher": prompt gerado por clube a partir de data/script-ficha-fields.json
 * e leitura leve da resposta colada pelo mentor (contagem por tag CERTO / PARCIAL / INCERTO).
 *
 * O prompt e o contrato com a IA do mentor (ChatGPT, Claude, Gemini): uma secao por campo no formato
 *   ### <chave> [CERTO|PARCIAL|INCERTO]
 * e um bloco final ### FONTES. Sem travessao em lugar nenhum.
 */
const SF = require('./script-ficha.cjs');

const TAGS = ['CERTO', 'PARCIAL', 'INCERTO'];

// Uma frase por M (5 M's) para situar o bloco antes das perguntas. Espelha BLOCK_INTRO de components/script/FichaScreen.tsx.
const BLOCK_INTRO = {
  1: 'Meta: onde o mentor quer chegar, com número e prazo.',
  2: 'Mentor: quem ele é e o que o legitima a cobrar caro.',
  3: 'Mentorado: para quem, com dor, desejo, setor, bolso e território.',
  4: 'Método: como ele leva o cliente de A para B.',
  5: 'A Mentoria: o que vai ao mercado como oferta.',
  6: 'Venda: como a venda acontece hoje.',
};

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Monta o prompt para a IA do mentor.
 * @param {{ mentorNome?: string, clubNome?: string, membros?: string[] }} ctx
 */
function buildPromptIA(ctx = {}) {
  const mentor = clean(ctx.mentorNome) || 'o mentor';
  const club = clean(ctx.clubNome);
  const membros = (ctx.membros || []).map(clean).filter(Boolean);
  const quem = club && club !== mentor ? `${mentor} (${club})` : mentor;
  const socios = membros.length > 1 ? ` A mentoria é tocada por ${membros.join(' e ')}.` : '';

  const L = [];
  L.push(`Você é a IA que mais conhece ${quem}. Preciso da sua ajuda para montar a ficha do script dos 7 passos da venda da mentoria de ${mentor}.${socios}`);
  L.push('');
  L.push('CONTEXTO');
  L.push(`O script dos 7 passos é o roteiro da reunião de venda da mentoria. A ficha abaixo tem ${SF.FIELD_KEYS.length} campos em ${SF.BLOCKS.length} blocos (os 5 M's: Meta, Mentor, Mentorado, Método e A Mentoria, mais a Venda). Responda cada campo com o que você sabe sobre ${mentor}, sobre a mentoria e sobre os clientes da mentoria, a partir dos documentos, conversas e materiais que você já tem.`);
  L.push('');
  L.push('CAMPOS DA FICHA');

  for (const b of SF.BLOCKS) {
    L.push('');
    L.push(`BLOCO ${b.numero}. ${b.nome}`);
    if (BLOCK_INTRO[b.numero]) L.push(BLOCK_INTRO[b.numero]);
    for (const f of SF.FIELDS.filter((x) => x.bloco === b.numero)) {
      const extra = [];
      if (f.opcoes && f.opcoes.length) extra.push(`opções: ${f.opcoes.join(' / ')}`);
      if (f.tipo === 'ls') extra.push('lista, um item por linha');
      if (!f.obrigatorio) extra.push('opcional');
      L.push(`${f.key}. ${clean(f.pergunta)}${extra.length ? ` (${extra.join('; ')})` : ''}`);
    }
  }

  L.push('');
  L.push('REGRAS DE RESPOSTA');
  L.push('1. Responda em português.');
  L.push(`2. Uma seção por campo, na ordem acima, exatamente neste formato (a chave, um espaço e a tag entre colchetes):`);
  L.push('### <chave> [CERTO|PARCIAL|INCERTO]');
  L.push('<resposta>');
  L.push('Exemplo: "### 2.1 [CERTO]" e na linha seguinte a resposta. Listas: um item por linha.');
  L.push('3. [CERTO] = você sabe disso por documentos ou pelas palavras do próprio mentor.');
  L.push('4. [PARCIAL] = você sabe parte, ou a informação pode estar desatualizada.');
  L.push('5. [INCERTO] = você está deduzindo ou não sabe. Nesse caso escreva "não sei" em vez de inventar.');
  L.push('6. Nunca invente números, nomes, clientes ou casos. Sem fonte, é [INCERTO] com "não sei".');
  L.push('7. Mantenha as palavras do próprio mentor sempre que tiver a fala dele (frases de cliente, nomes de método, promessas).');
  L.push(`8. Responda todos os ${SF.FIELD_KEYS.length} campos, mesmo os incertos.`);
  L.push('9. Termine com duas seções finais:');
  L.push('### FONTES');
  L.push('<lista do que você usou: documentos, conversas, materiais, um por linha>');
  L.push('### MATERIAIS QUE VALE A PENA ENVIAR');
  L.push('<liste, um por linha, os materiais que o mentor provavelmente tem e que ajudariam a completar os campos [PARCIAL] e [INCERTO]: apostila ou slides da mentoria, proposta ou roteiro de venda, transcrição ou gravação de reunião de venda, planilha ou export do CRM, página de vendas, depoimentos e casos com números, podcasts, entrevistas, reportagens, blog. Para cada um, diga qual campo ele preenche.>');
  return L.join('\n');
}

/**
 * Le a resposta colada e conta as secoes por tag. Nao valida conteudo; so o formato.
 * @returns {{ reconhecido: boolean, campos: number, certos: number, parciais: number, incertos: number, faltam: string[], tem_fontes: boolean, resumo: string }}
 */
function parseRespostaIA(texto) {
  const src = String(texto || '');
  const found = {};
  const re = /^\s*#{1,6}\s*(\d\.\d{1,2})\s*[\[(]\s*(CERTO|PARCIAL|INCERTO)\s*[\])]/gim;
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (!SF.FIELD_BY_KEY[key]) continue;
    found[key] = m[2].toUpperCase();
  }
  const keys = Object.keys(found);
  const count = (tag) => keys.filter((k) => found[k] === tag).length;
  const out = {
    reconhecido: keys.length > 0,
    campos: keys.length,
    certos: count('CERTO'),
    parciais: count('PARCIAL'),
    incertos: count('INCERTO'),
    faltam: SF.FIELD_KEYS.filter((k) => !found[k]),
    tem_fontes: /^\s*#{1,6}\s*FONTES\b/im.test(src),
  };
  out.resumo = resumoRespostaIA(out);
  return out;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function resumoRespostaIA(p) {
  if (!p || !p.reconhecido) return 'formato não reconhecido, salvamos mesmo assim';
  return `${plural(p.campos, 'campo', 'campos')}: ${plural(p.certos, 'certo', 'certos')}, ${plural(p.parciais, 'parcial', 'parciais')}, ${plural(p.incertos, 'incerto', 'incertos')}`;
}

module.exports = { TAGS, BLOCK_INTRO, buildPromptIA, parseRespostaIA, resumoRespostaIA };
