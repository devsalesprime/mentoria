export interface PriorityRecommendation {
  areaId: string;
  title: string;
  description: string;
  contentTitle: string;
  contentUrl: string;
}

export const PRIORITY_RECOMMENDATIONS: PriorityRecommendation[] = [
  // ─── Marketing ──────────────────────────────────────────────────────────────
  {
    areaId: 'positioning',
    title: 'Definir meu posicionamento e diferenciação',
    description: 'Você indicou que precisa definir seu posicionamento. Comece entendendo profundamente quem é seu cliente ideal e o que te diferencia dos demais.',
    contentTitle: 'Como crescer e monetizar nas mídias sociais',
    contentUrl: 'https://player.curseduca.com/embed/4d44febf-0823-487c-a6e9-07c7064157dc?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'content_strategy',
    title: 'Criar estratégia de conteúdo',
    description: 'Você quer criar uma estratégia de conteúdo consistente. Sua narrativa de marca é o alicerce — comece pela sua história e mensagem central.',
    contentTitle: 'Social Selling',
    contentUrl: 'https://player.curseduca.com/embed/1c3822f4-f96d-4136-89f4-f845f110cc2f?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'brand_authority',
    title: 'Construir autoridade no mercado',
    description: 'Construir autoridade exige consistência e prova social. Use suas conquistas e depoimentos como base para comunicar seu valor.',
    contentTitle: 'Como crescer e monetizar nas mídias sociais',
    contentUrl: 'https://player.curseduca.com/embed/4d44febf-0823-487c-a6e9-07c7064157dc?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },

  // ─── Vendas ─────────────────────────────────────────────────────────────────
  {
    areaId: 'first_clients',
    title: 'Conquistar meus primeiros clientes',
    description: 'Você indicou que precisa conquistar seus primeiros clientes. Comece com um pitch claro e confiante para sua primeira abordagem.',
    contentTitle: 'Pitch de 1 minuto',
    contentUrl: 'https://player.curseduca.com/embed/87180723-2379-42d7-90d3-c7d15a298b6c?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'scale_acquisition',
    title: 'Escalar a captação de clientes',
    description: 'Para escalar, você precisa de um sistema que funcione além do seu esforço individual. Entenda como gerar demanda de forma previsível.',
    contentTitle: 'Geração de demanda',
    contentUrl: 'https://player.curseduca.com/embed/8619f283-9c0d-4097-9faa-5da3df1552ae?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'increase_ticket',
    title: 'Aumentar meu ticket médio',
    description: 'Aumentar o ticket é sobre aumentar o valor percebido. Revise sua oferta com foco no resultado que você entrega, não no que você faz.',
    contentTitle: 'Gatilhos mentais inteligentes',
    contentUrl: 'https://player.curseduca.com/embed/de117bfa-3737-4df8-8f87-e2f599deacd0?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'improve_conversion',
    title: 'Melhorar minha taxa de conversão',
    description: 'Melhorar conversão começa por entender as objeções e gatilhos de decisão do seu público. Use um processo estruturado para guiar cada conversa.',
    contentTitle: '7 passos da venda com Dani Martins',
    contentUrl: 'https://player.curseduca.com/embed/aa26c9f4-cf7d-4246-acfd-0f991cf0c7ef?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },

  // ─── Modelo de Negócios ─────────────────────────────────────────────────────
  {
    areaId: 'structure_method',
    title: 'Estruturar ou refinar meu método',
    description: 'Estruturar seu método é o que transforma experiência em escala. Comece documentando seus pilares e o caminho de transformação que você oferece.',
    contentTitle: 'Como criar o meu método',
    contentUrl: 'https://player.curseduca.com/embed/c4eff43a-0087-4955-a54b-00539677be31?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'define_offer',
    title: 'Definir ou melhorar minha oferta',
    description: 'Uma oferta forte é a base de tudo. Revisite seus entregáveis, bônus e preço com foco no resultado transformador que você proporciona.',
    contentTitle: 'As 4 camadas de valor da dor',
    contentUrl: 'https://player.curseduca.com/embed/d7c256fe-ccdf-40f2-bb43-8c72cc4194f6?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'systemize_delivery',
    title: 'Sistematizar a entrega da mentoria',
    description: 'Sistematizar é o que permite escalar sem perder qualidade. Comece mapeando cada etapa da sua entrega e identifique o que pode ser padronizado.',
    contentTitle: 'Construindo seu método na prática',
    contentUrl: 'https://player.curseduca.com/embed/9d2acab1-d354-4675-805c-6eb834b51e92?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
  {
    areaId: 'scale_programs',
    title: 'Escalar com programas em grupo ou equipe',
    description: 'Escalar com grupo exige um método robusto e uma oferta clara. Certifique-se de que seu posicionamento e entregáveis estão prontos para múltiplos clientes simultâneos.',
    contentTitle: 'Comece por aqui',
    contentUrl: 'https://player.curseduca.com/embed/032ab5a9-f9be-4233-9d43-9c320a88a53f?api_key=514f682c8d9b37c075733fe2d123b15ad2ea4b2d',
  },
];

export function getRecommendationsForAreas(areaIds: string[]): PriorityRecommendation[] {
  return areaIds
    .map(id => PRIORITY_RECOMMENDATIONS.find(r => r.areaId === id))
    .filter((r): r is PriorityRecommendation => r !== undefined);
}
