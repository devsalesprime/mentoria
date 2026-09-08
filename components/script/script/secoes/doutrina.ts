/**
 * Doutrina fixa do leitor (SPEC-workflow-v4-decisoes-08-09 §2 itens 16 e 23, decisão A5).
 *
 * O que é igual para todo clube não é gerado pelo runner: mora aqui, escrito uma vez, e o leitor
 * desenha do lado do texto do script. Nada daqui é reescrito por versão nem depende da ficha.
 *
 * - `NOTA_PERFIS`: a conclusão que fecha a tabela "Quem está do outro lado", no Passo 1.
 * - `CHECKLIST_PERFORMANCE`: as 10 perguntas da Dani Martins para avaliar uma reunião, copiadas
 *   literalmente de `comum-v2/06-checklist-performance-venda.md` (bloco 5 do treinamento
 *   Mentalidade de CEO com foco em receita). Só as perguntas e a linha de autoria.
 */

/** Conclusão fixa abaixo da tabela de perfis (Passo 1). */
export const NOTA_PERFIS =
  'A abertura e as perguntas mais abertas servem para a primeira leitura do perfil: são suposições iniciais, não um rótulo. Quando não souber o perfil, trate a pessoa como Dominante: objetividade, clareza e foco em resultado não incomodam ninguém, e quem precisa de mais detalhe, o Estável e o Conforme, vai perguntar.';

export const ROTULO_NOTA_PERFIS = 'Como usar a tabela';

export interface Checklist {
  titulo: string;
  atribuicao: string;
  perguntas: string[];
}

/** As 10 perguntas, verbatim do material da camada comum v2. */
export const CHECKLIST_PERFORMANCE: Checklist = {
  titulo: 'Checklist de performance da venda, por Dani Martins (10 perguntas para avaliar uma reunião)',
  atribuicao: 'Dani Martins, no treinamento Mentalidade de CEO com foco em receita.',
  perguntas: [
    'Logo no primeiro minuto, me apresentei como especialista e mostrei que entendo o desejo e a realidade do meu cliente?',
    'Fiz perguntas de contexto, necessidade, consequência e solução, ou pulei direto pra apresentação sem investigar?',
    'Deixei o cliente falar mais do que eu?',
    'Recapitulei o que ouvi antes de apresentar a solução?',
    'Mostrei como funciona antes de apresentar a prova social? (A ordem importa: primeiro você mostra como funciona, depois traz a prova social, senão o cliente fica perguntando "como foi que isso deu certo?".)',
    'Tratei as objeções antes que elas surgissem, com acolhimento e não com embate?',
    'Apresentei o preço por último e com segurança, usando a "coragem dupla" corretamente do jeito ensinado?',
    'O cliente saiu da reunião se sentindo bem com a experiência?',
    'Caso não tenha fechado, deixei um horário definido pra resposta?',
    'Pedi a recomendação / indicação de novos clientes?',
  ],
};

/** Rótulos do molde único de decisão (item 17): os mesmos nos 7 passos e nos dois documentos. */
export const ROTULO_AVANCAR = 'Quando avançar';
export const ROTULO_VOLTAR = 'Quando voltar';
export const ROTULO_CRITERIO = 'Critério de sucesso';

/** Rótulo do bloco de decisão quando o markdown não trouxe um. */
export const ROTULO_DECISAO = 'Quando avançar ou voltar';
