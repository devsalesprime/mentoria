/**
 * O catálogo de treinamentos por passo (data/treinamentos-por-passo.ts), a base da onda C.
 * O que este teste protege são as regras do Danilo (SPEC-workflow-v2-decisoes-06-09 §1 decisão 4 e §3,
 * mapa em MAPA-aulas-por-passo.md): os 7 passos com no máximo 2 recomendados, nada abaixo de 1 hora,
 * GUID de verdade da library 716048, embed montado a partir do GUID e, no Passo 1, o perfil de quem
 * vende antes do perfil do cliente.
 *
 * Atualizado com as decisões de 07/09/2026: no Passo 1 o perfil do cliente passou a ser o da Pâmela
 * Ferrari, o Passo 2 perdeu o "Spin Selling" e o Passo 7 ficou só com a "Recomendação" da Pâmela.
 * Toda gravação agora carrega também a capa (`thumbUrl`) e o HLS (`hlsUrl`) do manifesto da Bunny.
 *
 * Decisões de 08/09/2026: o Passo 4 ficou só com o "Use o Não" do Luã Paiva (as "Objeções" da Pâmela
 * saíram da tela), o Passo 5 ficou só com "Os Seis Porquês da Decisão" da Dani Martins e o "Fechamento"
 * da Pâmela desceu para o Passo 6, com o "por que ver agora" refeito para o compromisso. A contagem no ar
 * passa a ser 2, 1, 2, 1, 1, 2, 1.
 *
 * Decisões de 09/09/2026 (item 5 do dia): só a ORDEM dentro de dois passos. No Passo 3 o "Storytelling"
 * vem primeiro e a "Apresentação Cirúrgica" depois; no Passo 6 o "Fechamento" vem primeiro e o "Follow Up"
 * depois. Nenhuma gravação entrou nem saiu, e a contagem por passo não mudou.
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
    // contagem por passo depois das decisões de 08/09: 2, 1, 2, 1, 1, 2, 1
    expect(PASSOS.map((p) => treinamentosDoPasso(p).length)).toEqual([2, 1, 2, 1, 1, 2, 1]);
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

  it('toda gravação tem capa e HLS do CDN da Bunny, montados em cima do mesmo GUID', () => {
    const capas = new Set<string>();
    for (const t of todosOsTreinamentos()) {
      const base = `https://vz-6999111b-a97.b-cdn.net/${t.bunnyGuid}`;
      // hlsUrl é o playlist.m3u8 do mesmo GUID (guardado para o player nativo)
      expect(t.hlsUrl, t.titulo).toBe(`${base}/playlist.m3u8`);
      // thumbUrl nunca fica vazia: as 11 responderam 200 na conferência de 07/09
      expect(t.thumbUrl, t.titulo).not.toBeNull();
      expect(typeof t.thumbUrl, t.titulo).toBe('string');
      expect(t.thumbUrl as string, t.titulo).toMatch(
        new RegExp(`^https://vz-6999111b-a97\\.b-cdn\\.net/${t.bunnyGuid}/(thumbnail_[0-9a-f]+\\.jpg|preview\\.webp)$`)
      );
      expect((t.thumbUrl as string).startsWith(`${base}/`), t.titulo).toBe(true);
      capas.add(t.thumbUrl as string);
    }
    // uma capa por gravação, nenhuma repetida
    expect(capas.size).toBe(todosOsTreinamentos().length);
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
    // as duas tiradas em 07/09: "Spin Selling" (Passo 2) e a palestra do Prospere 2023 (Passo 7)
    expect(todosOsTreinamentos().map((t) => t.bunnyGuid)).not.toContain('0d4089d0-3d20-46cd-8345-ee4566f8492b');
    expect(todosOsTreinamentos().map((t) => t.bunnyGuid)).not.toContain('a88d0d5f-73da-43a9-aa73-b63aa1f46618');
    // a tirada em 08/09: "Objeções - Com Pâmela Ferrari" saiu do Passo 4 e não ficou em passo nenhum
    expect(todosOsTreinamentos().map((t) => t.bunnyGuid)).not.toContain('6690f16c-da9d-4f36-9400-3cfae11d9f77');
    expect(todosOsTreinamentos().map((t) => t.id)).not.toContain('corporate.objecoes-com-pamela-ferrari');
  });

  it('Passo 1: o perfil de quem vende vem primeiro, o perfil do cliente depois', () => {
    const [vendedor, cliente] = treinamentosDoPasso(1);
    expect(vendedor.id).toBe('imersao.2026-06.dani-martins-mentalidade-ceo');
    expect(vendedor.palestrante).toBe('Dani Martins');
    expect(vendedor.tipo).toBe('Imersão presencial');
    expect(vendedor.porQueAgora).toMatch(/quem vende/i);
    expect(cliente.id).toBe('corporate.perfil-comportamental-do-cliente-com-pamela-ferrari');
    expect(cliente.titulo).toBe('Perfil Comportamental do Cliente');
    expect(cliente.palestrante).toBe('Pâmela Ferrari');
    expect(cliente.tipo).toBe('Corporate');
    expect(cliente.porQueAgora).toMatch(/cliente/i);
    // a versão do Thiago Chiovatto saiu do Passo 1 em 07/09
    expect(todosOsTreinamentos().map((t) => t.bunnyGuid)).not.toContain('b5f9555c-0e88-43b4-8834-b18aec327076');
  });

  it('Passos 4, 5 e 6 depois de 08/09: o fechamento desceu para o compromisso', () => {
    expect(treinamentosDoPasso(4).map((t) => t.id)).toEqual(['corporate.use-o-nao-e-melhore-a-conversao-com-lua-paiva']);
    expect(treinamentosDoPasso(5).map((t) => t.id)).toEqual(['corporate.os-seis-porques-da-decisao-com-dani-martins']);
    const fechamento = treinamentosDoPasso(6)[0];
    expect(fechamento.palestrante).toBe('Pâmela Ferrari');
    expect(fechamento.bunnyGuid).toBe('b58ceaf3-0ab4-4bb1-9288-d961e5e0c3fd');
    // o "por que ver agora" fala do compromisso, que é o movimento do Passo 6
    expect(fechamento.porQueAgora).toMatch(/compromisso/i);
    expect(fechamento.porQueAgora).not.toContain('—');
  });

  it('ordem de 09/09: no Passo 3 o Storytelling abre; no Passo 6 o Fechamento abre', () => {
    expect(treinamentosDoPasso(3).map((t) => t.id)).toEqual([
      'corporate.storytelling-com-juliana-medeiros',
      'corporate.apresentacao-cirurgica-com-thiago-chiovatto',
    ]);
    expect(treinamentosDoPasso(3).map((t) => t.palestrante)).toEqual(['Juliana Medeiros', 'Thiago Chiovatto']);
    expect(treinamentosDoPasso(6).map((t) => t.id)).toEqual([
      'corporate.fechamento-com-pamela-ferrari',
      'corporate.follow-up-com-claudio-rosa',
    ]);
    expect(treinamentosDoPasso(6).map((t) => t.palestrante)).toEqual(['Pâmela Ferrari', 'Cláudio Rosa']);
    // a ordem da tela é a ordem das tarefas de "assistir" do passo
    expect(tarefasDoPasso(3)[0].texto).toContain('Storytelling');
    expect(tarefasDoPasso(6)[0].texto).toContain('Fechamento');
  });

  it('os títulos e os GUIDs batem com o MAPA, um por um', () => {
    const esperado: Record<number, Array<[string, string, number]>> = {
      1: [
        ['Palestra Dani Martins · Mentalidade de CEO com Foco em Receita: o dono como o melhor vendedor do negócio', '22741290-9d9e-407b-8512-226c91d4ba47', 169.3],
        ['Perfil Comportamental do Cliente', 'dc85b666-5282-42dc-b495-bded3345f416', 86.8],
      ],
      2: [
        ['A Arte de Fazer Perguntas - Com Pâmela Ferrari', '3fe9dfe7-a992-471b-afec-58f198ad547b', 81.0],
      ],
      3: [
        ['Storytelling', '4bded213-9729-48d4-bdf0-ec5bde22e187', 74.2],
        ['Apresentação Cirúrgica - Com Thiago Chiovatto', 'b0f2fcdd-1673-45cc-8874-ae9a3247c5d7', 80.0],
      ],
      4: [
        ['Use o Não e Melhore a Conversão', '76c8ab9d-104c-47be-bed5-d948317d4fd2', 62.9],
      ],
      5: [
        ['Os Seis Porquês da Decisão - Com Dani Martins', '351d4990-e6ae-4a22-be99-e37cf9daec30', 61.2],
      ],
      6: [
        ['Fechamento - Com Pâmela Ferrari', 'b58ceaf3-0ab4-4bb1-9288-d961e5e0c3fd', 72.3],
        ['Follow Up - Com Cláudio Rosa', '2b21162d-5d92-4bb1-91e9-08d1fe344c38', 60.6],
      ],
      7: [['Recomendação', '8a8cc7d2-7b67-4d09-8352-13df7625bf4e', 63.9]],
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
    // 2 treinamentos viram 5 tarefas; 1 treinamento vira 4 (Passos 2, 4, 5 e 7)
    expect(PASSOS.map((p) => tarefasDoPasso(p).length)).toEqual([5, 4, 5, 4, 4, 5, 4]);
  });

  it('contagem por passo em cima das chaves concluídas', () => {
    const feitas = new Set([chaveTarefa(2, 'treinar-falas'), chaveTarefa(2, 'aplicar-reuniao'), chaveTarefa(3, 'treinar-falas')]);
    expect(contagemDoPasso(2, feitas)).toEqual({ feitas: 2, total: 4 });
    expect(contagemDoPasso(3, feitas)).toEqual({ feitas: 1, total: 5 });
    expect(contagemDoPasso(6, feitas)).toEqual({ feitas: 0, total: 5 });
    const todas = new Set(tarefasDoPasso(7).map((t) => chaveTarefa(7, t.id)));
    expect(contagemDoPasso(7, todas)).toEqual({ feitas: 4, total: 4 });
    expect(chaveTarefa(4, 'aplicar-reuniao')).toBe('4:aplicar-reuniao');
  });
});
