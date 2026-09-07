import React from 'react';
import { render, screen } from '@testing-library/react';

/**
 * O acordeao "Como funciona" saiu de Materiais na onda I (decisao D6) e virou a tela inicial do modulo;
 * a linha do prazo ficou, sozinha, em components/script/materiais/PrazoMateriais.tsx.
 *
 * `cohort_config.prazo_materiais` e texto livre do admin, entao ele envelhece sozinho: em 06/09 a tela
 * ainda mostrava "Prazo: amanhã, sexta 04/09, até as 10h", escrito na quarta. Duas regras agora:
 *   1. tem data e a data ja passou -> a linha some;
 *   2. "hoje"/"amanhã"/"ontem" nunca vao para a tela (foram escritos em outro dia e ninguem recalcula).
 */

import { PrazoMateriais, prazoParaExibir } from '../../components/script/materiais/PrazoMateriais';

const HOJE = new Date(2026, 8, 6); // 06/09/2026, o dia do QA

describe('prazoParaExibir', () => {
  it('vazio ou so espaco nao vira linha nenhuma', () => {
    expect(prazoParaExibir('', HOJE)).toBeNull();
    expect(prazoParaExibir('   ', HOJE)).toBeNull();
    expect(prazoParaExibir(undefined, HOJE)).toBeNull();
    expect(prazoParaExibir(null, HOJE)).toBeNull();
  });

  it('data vencida esconde a linha (o caso do QA)', () => {
    expect(prazoParaExibir('amanhã, sexta 04/09, até as 10h', HOJE)).toBeNull();
    expect(prazoParaExibir('até 05/09', HOJE)).toBeNull();
    expect(prazoParaExibir('até 31/08/2026', HOJE)).toBeNull();
  });

  it('a data de hoje ainda vale', () => {
    expect(prazoParaExibir('até 06/09, às 10h', HOJE)).toBe('até 06/09, às 10h');
  });

  it('data futura aparece', () => {
    expect(prazoParaExibir('até sexta, 12/09', HOJE)).toBe('até sexta, 12/09');
    expect(prazoParaExibir('até 02/01/2027', HOJE)).toBe('até 02/01/2027');
  });

  it('nunca imprime tempo relativo, mesmo quando a data ainda esta no futuro', () => {
    expect(prazoParaExibir('amanhã, 12/09, até as 10h', HOJE)).toBe('12/09, até as 10h');
    expect(prazoParaExibir('hoje até as 18h, 12/09', HOJE)).toBe('até as 18h, 12/09');
    expect(prazoParaExibir('depois de amanhã, 12/09', HOJE)).toBe('12/09');
  });

  it('sem data legivel a linha continua, so sem o relativo', () => {
    expect(prazoParaExibir('até o fim da semana', HOJE)).toBe('até o fim da semana');
    expect(prazoParaExibir('amanhã', HOJE)).toBeNull();
  });

  it('data invalida no texto nao esconde a linha por engano', () => {
    expect(prazoParaExibir('turma 32/13', HOJE)).toBe('turma 32/13');
  });
});

describe('PrazoMateriais: a linha do prazo', () => {
  it('mostra o prazo futuro', () => {
    render(<PrazoMateriais prazo="até sexta, 12/09" />);
    expect(screen.getByTestId('prazo-materiais')).toHaveTextContent('até sexta, 12/09');
  });

  it('nao mostra nada quando o admin deixou vazio', () => {
    render(<PrazoMateriais prazo="" />);
    expect(screen.queryByTestId('prazo-materiais')).toBeNull();
  });

  it('nao mostra nada quando a data configurada ja passou', () => {
    const ontem = new Date(Date.now() - 48 * 3600 * 1000);
    const texto = `amanhã, ${String(ontem.getDate()).padStart(2, '0')}/${String(ontem.getMonth() + 1).padStart(2, '0')}, até as 10h`;
    render(<PrazoMateriais prazo={texto} />);
    expect(screen.queryByTestId('prazo-materiais')).toBeNull();
    expect(screen.queryByText(/amanhã/)).toBeNull();
  });
});
