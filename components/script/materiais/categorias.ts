/**
 * Categorias de materiais do Script 7 Passos (tela Materiais) com descritivo e exemplos.
 * As chaves sao as mesmas aceitas por POST /api/files/upload (routes/files.cjs).
 * Copy aprovada pelo Danilo em 03/09: pt-BR com acentos, sem travessao.
 */
export interface MaterialCategoria {
  id: string;
  label: string;
  descricao: string;
  icon: string;
}

export const MATERIAL_CATEGORIAS: MaterialCategoria[] = [
  {
    id: 'script_transcricao_venda',
    label: 'Transcrições e gravações de reuniões de venda',
    descricao: 'Transcrição (txt, docx) de reuniões reais com clientes ou prospects. Áudio e vídeo: mande o link do Drive ou pelo WhatsApp. Quanto mais reuniões, melhor o script.',
    icon: '',
  },
  {
    id: 'script_apostila_slides',
    label: 'Apostila, slides e material da mentoria',
    descricao: 'Apostila, e-book, slides de aula, Canva exportado em PDF, manual do método. O que você entrega ou apresenta ao cliente.',
    icon: '',
  },
  {
    id: 'script_proposta_roteiro',
    label: 'Proposta, roteiro e material de venda',
    descricao: 'Proposta comercial, deck de vendas, roteiro que você usa hoje, página de vendas, tabela de preços, contrato ou termo.',
    icon: '',
  },
  {
    id: 'script_crm',
    label: 'CRM e planilhas',
    descricao: 'Export do CRM (csv, xlsx) ou planilha de leads e negócios: nome, origem, etapa, valor, resultado. Ajuda a ver ciclo, ticket e objeções reais.',
    icon: '',
  },
  {
    id: 'script_outros',
    label: 'Outros',
    descricao: 'Depoimentos, cases, prints de resultado, pesquisa de mercado, podcasts, entrevistas, reportagens, posts de blog: o que mais contar a história da sua mentoria.',
    icon: '',
  },
];

export const MATERIAL_CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  MATERIAL_CATEGORIAS.map((c) => [c.id, c.label]),
);

/**
 * A explicação do processo saiu daqui na onda I (decisão D6): quem conta como funciona agora é a tela
 * inicial do módulo (components/script/ComoFuncionaScreen.tsx), com o tempo real de cada etapa vindo
 * de GET /api/script/tempos. A promessa antiga ("em menos de um dia") brigava com a da tela de escolha
 * ("em minutos") e nenhuma das duas era medida: as duas saíram.
 */
export const COMO_FUNCIONA_ORDEM =
  'Quem faz antes recebe antes: mandou os arquivos e revisou a ficha, o seu script entra na fila.';

export const LINKS_DICA =
  'Links do seu site, página de vendas, Instagram, podcasts, entrevistas, reportagens, blog, aulas públicas. Só o link; acesso com senha vai na seção abaixo.';

/** Secao "Peca ajuda a IA que voce ja usa" (o prompt em si vem de GET /api/script/prompt-ia). */
export const PROMPT_IA_INTRO =
  'O ChatGPT, o Claude ou o Gemini que você já usa sabe muito sobre a sua mentoria. Em três passos, isso vira ficha.';
export const PROMPT_IA_PASSOS: string[] = [
  'Copie o prompt.',
  'Cole na IA que você mais usa. Melhor se ela já conhece a sua mentoria.',
  'Copie a resposta inteira e cole aqui embaixo.',
];
export const PROMPT_IA_GANHO =
  'A resposta vem marcada: o que é certo e o que é parcial ou incerto. Sua ficha chega mais completa e o script sai mais parecido com você.';

export const ACESSO_PLATAFORMA_AVISO =
  'Usamos este acesso só para ler as suas aulas e levar o seu método para a ficha e para o script. Só o Danilo vê. Depois você pode trocar a senha.';
