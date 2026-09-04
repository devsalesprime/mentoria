import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressoPreenchimento, estadosDasEtapas, formatarDuracao, ETAPAS } from '../../components/script/ProgressoPreenchimento';
import type { ScriptJobInfo, ScriptJobProgresso } from '../../hooks/useScriptFicha';

function jobDe(status: ScriptJobInfo['status'], progresso: ScriptJobProgresso | null = null, extra: Partial<ScriptJobInfo> = {}): ScriptJobInfo {
  return {
    id: 'job-1', tipo: 'prefill', status, attempts: 1, progresso, error: null,
    created_at: '2026-09-04 10:00:00', started_at: status === 'queued' ? null : '2026-09-04 10:00:05', finished_at: null,
    ...extra,
  };
}

const semTravessaoNemDiagnostico = (el: HTMLElement) => {
  const t = el.textContent || '';
  expect(t).not.toContain('—');
  expect(t.toLowerCase()).not.toContain('diagnóstico');
  expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
};

describe('estadosDasEtapas', () => {
  it('7 etapas: leitura + blocos 1 a 6', () => {
    expect(ETAPAS).toEqual(['Leitura dos materiais', 'Meta', 'Mentor', 'Mentorado', 'Método', 'A Mentoria', 'Venda']);
    expect(estadosDasEtapas(null)).toEqual(Array(7).fill('pendente'));
    expect(estadosDasEtapas(jobDe('queued'))).toEqual(Array(7).fill('pendente'));
  });

  it('extração: leitura em andamento, blocos pendentes', () => {
    expect(estadosDasEtapas(jobDe('running', { fase: 'extracao', etapa_atual: 1, etapas_total: 7, blocos_concluidos: [] })))
      .toEqual(['andamento', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente']);
  });

  it('bloco: leitura concluída, blocos prontos, o atual em andamento, erro marcado', () => {
    expect(estadosDasEtapas(jobDe('running', { fase: 'bloco', etapa_atual: 4, etapas_total: 7, blocos_concluidos: [1, 2], blocos_com_erro: [] })))
      .toEqual(['concluido', 'concluido', 'concluido', 'andamento', 'pendente', 'pendente', 'pendente']);
    expect(estadosDasEtapas(jobDe('running', { fase: 'bloco', etapa_atual: 5, etapas_total: 7, blocos_concluidos: [1, 3], blocos_com_erro: [2] })))
      .toEqual(['concluido', 'concluido', 'erro', 'concluido', 'andamento', 'pendente', 'pendente']);
    // sem etapa_atual: o próximo depois dos concluídos
    expect(estadosDasEtapas(jobDe('running', { fase: 'bloco', blocos_concluidos: [1] })))
      .toEqual(['concluido', 'concluido', 'andamento', 'pendente', 'pendente', 'pendente', 'pendente']);
  });

  it('finalizando e done: tudo concluído (erro continua erro)', () => {
    expect(estadosDasEtapas(jobDe('running', { fase: 'finalizando', blocos_concluidos: [1, 2, 3, 4, 5, 6] }))).toEqual(Array(7).fill('concluido'));
    expect(estadosDasEtapas(jobDe('done', { fase: 'finalizando', blocos_concluidos: [1, 2, 3, 4, 6], blocos_com_erro: [5] })))
      .toEqual(['concluido', 'concluido', 'concluido', 'concluido', 'concluido', 'erro', 'concluido']);
  });
});

describe('formatarDuracao', () => {
  it('segundos, minutos, horas', () => {
    expect(formatarDuracao(20000)).toBe('20 s');
    expect(formatarDuracao(125000)).toBe('2 min');
    expect(formatarDuracao(3_720_000)).toBe('1 h 2 min');
    expect(formatarDuracao(-5)).toBe('0 s');
  });
});

describe('ProgressoPreenchimento', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('sem job não renderiza', () => {
    const { container } = render(<ProgressoPreenchimento job={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('na fila: título, mensagem e nada de trilha', () => {
    render(<ProgressoPreenchimento job={jobDe('queued')} />);
    const painel = screen.getByTestId('progresso-preenchimento');
    expect(painel).toHaveAttribute('data-status', 'queued');
    expect(screen.getByTestId('progresso-titulo')).toHaveTextContent('Estamos lendo os seus materiais');
    // Sem jargao interno para o mentor
    expect(painel.textContent).not.toMatch(/\b(job|worker|cohort|prefill|gate)\b/i);
    expect(screen.getByTestId('progresso-mensagem')).toHaveTextContent('Na fila');
    expect(screen.queryByTestId('etapa-0')).not.toBeInTheDocument();
    semTravessaoNemDiagnostico(painel);
  });

  it('rodando: trilha de 7 etapas com estados, rótulo do worker, arquivos lidos, tempo e "Atualizado há"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T10:02:05Z'));
    const p: ScriptJobProgresso = { fase: 'extracao', etapa_atual: 1, etapas_total: 7, rotulo: 'Lendo os materiais', arquivos_lidos: 2, arquivos_total: 5, blocos_concluidos: [], atualizado_em: '2026-09-04T10:01:45.000Z' };
    render(<ProgressoPreenchimento job={jobDe('running', p)} atualizadoEm={Date.now() - 20000} />);
    const painel = screen.getByTestId('progresso-preenchimento');
    expect(screen.getByTestId('progresso-mensagem')).toHaveTextContent('Lendo os materiais');
    expect(screen.getByTestId('etapa-0')).toHaveAttribute('data-estado', 'andamento');
    expect(screen.getByTestId('etapa-6')).toHaveAttribute('data-estado', 'pendente');
    expect(screen.getByTestId('progresso-arquivos')).toHaveTextContent('Arquivos lidos: 2 de 5');
    expect(screen.getByTestId('progresso-decorrido')).toHaveTextContent('Em andamento há 2 min');
    expect(screen.getByTestId('progresso-atualizado')).toHaveTextContent('Atualizado há 20 s');
    expect(painel.textContent).toContain('Venda');
    semTravessaoNemDiagnostico(painel);
  });

  it('pronto: "Pronto: N sugestões chegaram", trilha concluída, "Entendi" dispensa', () => {
    const onDispensar = vi.fn();
    render(<ProgressoPreenchimento job={jobDe('done', { fase: 'finalizando', blocos_concluidos: [1, 2, 3, 4, 5, 6] })} sugestoes={28} onDispensar={onDispensar} />);
    expect(screen.getByTestId('progresso-titulo')).toHaveTextContent('Pronto: 28 sugestões chegaram');
    expect(screen.getByTestId('etapa-6')).toHaveAttribute('data-estado', 'concluido');
    expect(screen.queryByTestId('progresso-atualizado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(onDispensar).toHaveBeenCalledTimes(1);
    const { unmount } = render(<ProgressoPreenchimento job={jobDe('done')} sugestoes={1} />);
    expect(screen.getAllByTestId('progresso-titulo').at(-1)).toHaveTextContent('Pronto: 1 sugestão chegou');
    unmount();
  });

  it('needs_human e error: mensagens da casa, sem trilha', () => {
    const { rerender } = render(<ProgressoPreenchimento job={jobDe('needs_human')} />);
    expect(screen.getByTestId('progresso-mensagem')).toHaveTextContent('Nossa equipe está conferindo o seu material; você pode continuar preenchendo.');
    expect(screen.queryByTestId('etapa-0')).not.toBeInTheDocument();
    rerender(<ProgressoPreenchimento job={jobDe('error', null, { error: 'PDF corrompido' })} />);
    expect(screen.getByTestId('progresso-mensagem')).toHaveTextContent('Tivemos um problema ao ler os materiais; nossa equipe foi avisada. Você pode continuar preenchendo.');
    // O erro tecnico do worker nunca aparece para o mentor
    expect(screen.getByTestId('progresso-preenchimento').textContent).not.toContain('PDF corrompido');
    semTravessaoNemDiagnostico(screen.getByTestId('progresso-preenchimento'));
  });

  it('lista os campos com sugestão nova', () => {
    render(<ProgressoPreenchimento job={jobDe('running', { fase: 'bloco', etapa_atual: 3, blocos_concluidos: [1] })} novas={['2.1 · Mentor', '2.3 · Diferença']} />);
    const novas = screen.getByTestId('progresso-novas');
    expect(novas).toHaveTextContent('Novas sugestões em:');
    expect(novas).toHaveTextContent('2.1 · Mentor');
    expect(novas).toHaveTextContent('2.3 · Diferença');
  });
});
