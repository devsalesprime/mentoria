/**
 * O catálogo de treinamentos por passo (data/treinamentos-por-passo.ts), a base da onda C.
 * O que este teste protege são as regras do Danilo (SPEC-workflow-v2-decisoes-06-09 §1 decisão 4 e §3,
 * mapa em MAPA-aulas-por-passo.md): os 7 passos com no máximo 2 recomendados, nada abaixo de 1 hora,
 * GUID de verdade da library 716048, embed montado a partir do GUID e, no Passo 1, o perfil de quem
 * vende antes do perfil do cliente.
 */
import {
  BUNNY_LIBRARY,
  TREINAMENTOS_POR_PASSO,
  duracaoLegivel,
  embedDoGuid,
  todosOsTreinamentos,
  treinamentosDoPasso,
  urlDoTreinamento,
  type Treinamento,
} from '../../data/treinamentos-por-passo';
import { chaveTarefa, contagemDoPasso, idDeAssistir, tarefasDoPasso } from '../../components/script/script/tarefas';

const PASSOS = [1, 2, 3, 4, 5, 6, 7];
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIPOS = ['Imersão presencial', 'Corporate', 'Sócios', 'Formação de Mentoria', 'Evento'];

describe('data/treinamentos-por-passo · forma do catálogo', () => {
  it('os 7 passos existem, com 1 ou 2 recomendados cada e sem id repetido dentro do passo', () => {
    expect(Object.keys(TREINAMENTOS_POR_PASSO).map(Number).sort((a, b) => a - b)).toEqual(PASSOS);
    for (const p of PASSOS) {
      const lista = treinamentosDoPasso(p);
      expect(lista.length, `passo ${p}`).toBeGreaterThanOrEqual(1);
      expect(lista.length, `passo ${p}`).toBeLessThanOrEqual(2);
      expect(new Set(lista.map((t) => t.id)).size).toBe(lista.length);
    }
    // Passo 6 tem um só: é o que sobrou acima de 1 hora no tema; o Passo 7 ganhou a palestra do Prospere 2023
    expect(treinamentosDoPasso(6)).toHaveLength(1);
    expect(treinamentosDoPasso(7)).toHaveLength(2);
    expect(treinamentosDoPasso(0)).toEqual([]);
    expect(treinamentosDoPasso(8)).toEqual([]);
    expect(treinamentosDoPasso(null)).toEqual([]);
    expect(todosOsTreinamentos()).toHaveLength(PASSOS.reduce((s, p) => s + treinamentosDoPasso(p).length, 0));
  });

  it('todo GUID é hexadecimal de verdade (bem mais que 8 caracteres) e o embed é montado a partir dele', () => {
    for (const t of todosOsTreinamentos()) {
      const soHex = t.bunnyGuid.replace(/-/g, '');
      expect(soHex.length, t.titulo).toBeGreaterThanOrEqual(8);
      expect(soHex, t.titulo).toMatch(/^[0-9a-f]+$/);
      expect(t.bunnyGuid, t.titulo).toMatch(GUID_RE);
      expect(t.embedUrl).toBe(`https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY}/${t.bunnyGuid}`);
      expect(t.embedUrl).toBe(embedDoGuid(t.bunnyGuid));
      expect(t.embedUrl.startsWith('https://iframe.mediadelivery.net/')).toBe(true);
    }
    expect(BUNNY_LIBRARY).toBe('716048');
  });

  it('nenhuma gravação abaixo de 1 hora e todo campo obrigatório preenchido', () => {
    for (const t of todosOsTreinamentos()) {
      expect(t.duracaoMin, t.titulo).toBeGreaterThan(60);
      expect(t.id).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(t.titulo.trim().length).toBeGreaterThan(3);
      expect(t.palestrante.trim().length).toBeGreaterThan(2);
      expect(TIPOS).toContain(t.tipo);
      expect(t.porQueAgora.trim().length).toBeGreaterThan(20);
      // ninguém tem marca de tempo documentada ainda (MAPA §3.3)
      expect(t.inicioSegundos).toBeUndefined();
    }
    // a gravação derrubada pela medição (57,2 min) não entrou
    expect(todosOsTreinamentos().map((t) => t.bunnyGuid)).not.toContain('da4cdba9-7c55-49ad-8df7-d85bb208c32f');
  });

  it('Passo 1: o perfil de quem vende vem primeiro, o perfil do cliente depois', () => {
    const [vendedor, cliente] = treinamentosDoPasso(1);
    expect(vendedor.id).toBe('imersao.2026-06.dani-martins-mentalidade-ceo');
    expect(vendedor.palestrante).toBe('Dani Martins');
    expect(vendedor.tipo).toBe('Imersão presencial');
    expect(vendedor.porQueAgora).toMatch(/quem vende/i);
    expect(cliente.id).toBe('corporate.perfil-do-cliente-com-thiago-chiovatto');
    expect(cliente.titulo).toBe('Perfil do Cliente - Com Thiago Chiovatto');
    expect(cliente.palestrante).toBe('Thiago Chiovatto');
    expect(cliente.porQueAgora).toMatch(/cliente/i);
  });

  it('os títulos e os GUIDs batem com o MAPA, um por um', () => {
    const esperado: Record<number, Array<[string, string, number]>> = {
      1: [
        ['Palestra Dani Martins · Mentalidade de CEO com Foco em Receita: o dono como o melhor vendedor do negócio', '22741290-9d9e-407b-8512-226c91d4ba47', 169.3],
        ['Perfil do Cliente - Com Thiago Chiovatto', 'b5f9555c-0e88-43b4-8834-b18aec327076', 88.6],
      ],
      2: [
        ['A Arte de Fazer Perguntas - Com Pâmela Ferrari', '3fe9dfe7-a992-471b-afec-58f198ad547b', 81.0],
        ['Spin Selling', '0d4089d0-3d20-46cd-8345-ee4566f8492b', 84.0],
      ],
      3: [
        ['Apresentação Cirúrgica - Com Thiago Chiovatto', 'b0f2fcdd-1673-45cc-8874-ae9a3247c5d7', 80.0],
        ['Storytelling', '4bded213-9729-48d4-bdf0-ec5bde22e187', 74.2],
      ],
      4: [
        ['Objeções - Com Pâmela Ferrari', '6690f16c-da9d-4f36-9400-3cfae11d9f77', 71.1],
        ['Use o Não e Melhore a Conversão', '76c8ab9d-104c-47be-bed5-d948317d4fd2', 62.9],
      ],
      5: [
        ['Fechamento - Com Pâmela Ferrari', 'b58ceaf3-0ab4-4bb1-9288-d961e5e0c3fd', 72.3],
        ['Os Seis Porquês da Decisão - Com Dani Martins', '351d4990-e6ae-4a22-be99-e37cf9daec30', 61.2],
      ],
      6: [['Follow Up - Com Cláudio Rosa', '2b21162d-5d92-4bb1-91e9-08d1fe344c38', 60.6]],
      7: [['Recomendação', '8a8cc7d2-7b67-4d09-8352-13df7625bf4e', 63.9], ['Palestra Dani Martins · Técnicas avançadas de venda', 'a88d0d5f-73da-43a9-aa73-b63aa1f46618', 95.6]],
    };
    for (const p of PASSOS) {
      expect(treinamentosDoPasso(p).map((t) => [t.titulo, t.bunnyGuid, t.duracaoMin])).toEqual(esperado[p]);
    }
  });

  it('copy: sem travessão fora do título literal da gravação, sem "diagnóstico", sem emoji e sem jargão', () => {
    const nossoTexto = todosOsTreinamentos().flatMap((t) => [t.porQueAgora, t.palestrante, t.tipo]);
    for (const texto of nossoTexto) {
      expect(texto).not.toContain('—');
      expect(texto).not.toMatch(/diagn[óo]stic/i);
      expect(texto).not.toMatch(/\bjob\b|\bcohort\b/i);
      expect(texto).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(texto.trim()).toBe(texto);
    }
    // o único travessão da base é o nome literal da gravação no catálogo
    const comTravessao = todosOsTreinamentos().filter((t) => t.titulo.includes('—'));
    expect(comTravessao).toEqual([]); // regra da casa: nenhum travessão, nem em título literal de gravação
  });

  it('urlDoTreinamento e duracaoLegivel', () => {
    const t = treinamentosDoPasso(6)[0];
    expect(urlDoTreinamento(t)).toBe(t.embedUrl);
    expect(urlDoTreinamento(t, { autoplay: true })).toBe(`${t.embedUrl}?autoplay=true`);
    const comMarca: Treinamento = { ...t, inicioSegundos: 930 };
    expect(urlDoTreinamento(comMarca)).toBe(`${t.embedUrl}?t=930`);
    expect(urlDoTreinamento(comMarca, { autoplay: true })).toBe(`${t.embedUrl}?t=930&autoplay=true`);
    expect(duracaoLegivel(169.3)).toBe('2 h 49 min');
    expect(duracaoLegivel(60.6)).toBe('1 h 1 min');
    expect(duracaoLegivel(120)).toBe('2 h');
    expect(duracaoLegivel(45)).toBe('45 min');
  });
});

describe('tarefas do movimento (components/script/script/tarefas.ts)', () => {
  it('cada passo tem uma tarefa de assistir por treinamento, mais treinar, aplicar e marcar', () => {
    for (const p of PASSOS) {
      const treinos = treinamentosDoPasso(p);
      const tarefas = tarefasDoPasso(p);
      expect(tarefas).toHaveLength(treinos.length + 3);
      expect(tarefas.slice(0, treinos.length).map((t) => t.id)).toEqual(treinos.map((t) => idDeAssistir(t.id)));
      expect(tarefas.slice(-3).map((t) => t.id)).toEqual(['treinar-falas', 'aplicar-reuniao', 'marcar-ajustes']);
      expect(tarefas.slice(-3).map((t) => t.texto)).toEqual([
        'Treinar as falas deste passo em voz alta',
        'Aplicar na próxima reunião e anotar o que aconteceu',
        'Marcar o que funcionou e o que ajustar',
      ]);
      // só a última abre a dica dos grifos
      expect(tarefas.filter((t) => t.dicaGrifo).map((t) => t.id)).toEqual(['marcar-ajustes']);
      // id sempre no formato que o servidor aceita
      for (const t of tarefas) expect(t.id).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      // travessão só pode aparecer quando vem de dentro do título literal da gravação
      for (const t of tarefas) {
        if (!t.texto.includes('—')) continue;
        expect(treinos.some((tr) => t.texto.includes(tr.titulo) && tr.titulo.includes('—'))).toBe(true);
      }
      for (const t of tarefas.slice(-3)) expect(t.texto).not.toContain('—');
    }
    expect(tarefasDoPasso(1)[0].texto).toContain('Assistir a "Palestra Dani Martins');
    expect(tarefasDoPasso(1)).toHaveLength(5);
    expect(tarefasDoPasso(6)).toHaveLength(4);
  });

  it('contagem por passo em cima das chaves concluídas', () => {
    const feitas = new Set([chaveTarefa(2, 'treinar-falas'), chaveTarefa(2, 'aplicar-reuniao'), chaveTarefa(3, 'treinar-falas')]);
    expect(contagemDoPasso(2, feitas)).toEqual({ feitas: 2, total: 5 });
    expect(contagemDoPasso(3, feitas)).toEqual({ feitas: 1, total: 5 });
    expect(contagemDoPasso(6, feitas)).toEqual({ feitas: 0, total: 4 });
    const todas = new Set(tarefasDoPasso(7).map((t) => chaveTarefa(7, t.id)));
    expect(contagemDoPasso(7, todas)).toEqual({ feitas: 5, total: 5 });
    expect(chaveTarefa(4, 'aplicar-reuniao')).toBe('4:aplicar-reuniao');
  });
});
