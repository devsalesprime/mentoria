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
    icon: '🗣️',
  },
  {
    id: 'script_apostila_slides',
    label: 'Apostila, slides e material da mentoria',
    descricao: 'Apostila, e-book, slides de aula, Canva exportado em PDF, manual do método. O que você entrega ou apresenta ao cliente.',
    icon: '📚',
  },
  {
    id: 'script_proposta_roteiro',
    label: 'Proposta, roteiro e material de venda',
    descricao: 'Proposta comercial, deck de vendas, roteiro que você usa hoje, página de vendas, tabela de preços, contrato ou termo.',
    icon: '📝',
  },
  {
    id: 'script_crm',
    label: 'CRM e planilhas',
    descricao: 'Export do CRM (csv, xlsx) ou planilha de leads e negócios: nome, origem, etapa, valor, resultado. Ajuda a ver ciclo, ticket e objeções reais.',
    icon: '📊',
  },
  {
    id: 'script_outros',
    label: 'Outros',
    descricao: 'Depoimentos, cases, prints de resultado, pesquisa de mercado, entrevistas, o que mais contar a história da sua mentoria.',
    icon: '📎',
  },
];

export const MATERIAL_CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  MATERIAL_CATEGORIAS.map((c) => [c.id, c.label]),
);

export const COMO_FUNCIONA_PASSOS: string[] = [
  'Você envia o que tiver, aqui em Materiais. Só você e o Danilo veem o que você enviou.',
  'A gente monta a sua ficha com o que você enviou e com o que já sabemos de você, cada item com a fonte ao lado.',
  'Você revisa e aprova: confirma o que está certo, ajusta o que mudou, preenche o que faltou.',
  'Com a ficha aprovada, sai o seu script dos 7 passos da venda, na sua voz, personalizado para a sua mentoria e para o seu cliente.',
];

export const COMO_FUNCIONA_FRASE =
  'Quem faz antes recebe antes. Mandou os arquivos e revisou a ficha? Em menos de um dia o seu script está na sua mão para a próxima reunião.';

export const ACESSO_PLATAFORMA_AVISO =
  'Guardamos este acesso só para extrair o conteúdo das suas aulas e transformar em base de conhecimento da sua IA. Só o Danilo vê. Você pode trocar a senha depois.';
