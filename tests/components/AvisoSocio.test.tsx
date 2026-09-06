import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Escrita concorrente de sócios na tela (components/script/AvisoSocio.tsx dentro do FichaField):
 * - o aviso chama o sócio pelo nome e mostra o que ele respondeu, sem bloquear nada
 * - "Manter a resposta dele" fecha o assunto; "Usar a minha" reenvia a decisão desta tela
 * - o campo decidido pelo sócio ganha a linha "respondido por Fulano há ..."; o meu campo não ganha nada
 */
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { items: [] } }), post: vi.fn(), delete: vi.fn() } }));

import { FichaField } from '../../components/script/FichaField';
import {
  COPY_MANTER, COPY_USAR_MINHA, haQuantoTempo, primeiroNome, respondidoPeloSocio, textoDoAviso,
} from '../../components/script/AvisoSocio';
import { SCRIPT_FIELD_BY_KEY, type ScriptFieldView } from '../../data/script-ficha-fields';
import type { FieldConflito } from '../../hooks/useScriptFicha';

const EU = 'ana@x.com';
const SOCIO = { email: 'gu@x.com', nome: 'Gustavo Prado' };

function campoDe(key: string, extra: Partial<ScriptFieldView> = {}): ScriptFieldView {
  const def = SCRIPT_FIELD_BY_KEY[key];
  return {
    key,
    bloco: def.bloco,
    nome: def.nome,
    pergunta: def.pergunta,
    tipo: def.tipo,
    tipoRaw: def.tipoRaw,
    obrigatorio: def.obrigatorio,
    minutos: def.minutos,
    opcoes: def.opcoes ?? null,
    widget: def.widget,
    template: def.template,
    sugerido: '',
    classe: 'VZ',
    fonte: '',
    alternativas: [],
    status: 'vazio',
    valor: '',
    estrutura: null,
    valor_efetivo: '',
    decidido: false,
    atualizado_por: null,
    atualizado_em: null,
    rev: 0,
    decidido_por: null,
    ...extra,
  };
}

const conflitoDe = (key: string): FieldConflito => ({
  field_key: key,
  rev: 3,
  status: 'editado',
  valor: 'A resposta que o Gustavo escreveu',
  valor_efetivo: 'A resposta que o Gustavo escreveu',
  sugerido: '',
  decidido_por: SOCIO,
  atualizado_em: new Date().toISOString(),
  minha: { status: 'editado', valor: 'A minha resposta', rev: 1 },
});

describe('as peças de texto', () => {
  it('primeiro nome do sócio; sem nome, o começo do e-mail', () => {
    expect(primeiroNome(SOCIO)).toBe('Gustavo');
    expect(primeiroNome({ email: 'gu@x.com', nome: '' })).toBe('gu');
    expect(primeiroNome(null)).toBe('');
  });

  it('"há quanto tempo" em português, sem número quebrado', () => {
    const agora = Date.parse('2026-09-06T18:00:00Z');
    expect(haQuantoTempo('2026-09-06T17:59:30Z', agora)).toBe('agora');
    expect(haQuantoTempo('2026-09-06T17:55:00Z', agora)).toBe('há 5 minutos');
    expect(haQuantoTempo('2026-09-06T17:00:00Z', agora)).toBe('há 1 hora');
    expect(haQuantoTempo('2026-09-04 18:00:00', agora)).toBe('há 2 dias');
    expect(haQuantoTempo(null, agora)).toBe('');
  });

  it('o aviso chama a pessoa pelo nome e cai numa frase inteira sem ele', () => {
    expect(textoDoAviso(SOCIO)).toBe('O seu sócio Gustavo acabou de responder este campo:');
    expect(textoDoAviso(null)).toBe('O seu sócio acabou de responder este campo:');
    // copy da casa: sem travessão e sem jargão
    expect(textoDoAviso(SOCIO)).not.toMatch(/—|rev|conflito/i);
  });

  it('só é resposta do sócio quando o campo está decidido por outra pessoa', () => {
    const decidido = { decidido: true, decidido_por: SOCIO };
    expect(respondidoPeloSocio(decidido, EU)).toBe(true);
    expect(respondidoPeloSocio(decidido, 'GU@X.com')).toBe(false);
    expect(respondidoPeloSocio({ decidido: false, decidido_por: SOCIO }, EU)).toBe(false);
    expect(respondidoPeloSocio({ decidido: true, decidido_por: null }, EU)).toBe(false);
  });
});

describe('o aviso dentro do campo', () => {
  it('mostra o nome do sócio, o que ele respondeu e as duas saídas', () => {
    render(
      <FichaField
        campo={campoDe('3.3')}
        onDecide={vi.fn()}
        conflito={conflitoDe('3.3')}
        onManterDoSocio={vi.fn()}
        onUsarAMinha={vi.fn()}
        meuEmail={EU}
      />,
    );
    const aviso = screen.getByTestId('aviso-socio-3.3');
    expect(aviso.textContent).toContain('O seu sócio Gustavo acabou de responder este campo:');
    expect(aviso.textContent).toContain('A resposta que o Gustavo escreveu');
    expect(screen.getByText(COPY_MANTER)).toBeTruthy();
    expect(screen.getByText(COPY_USAR_MINHA)).toBeTruthy();
    // não bloqueia: o campo continua editável
    expect(screen.getByTestId('ficha-field-3.3')).toBeTruthy();
  });

  it('"Manter a resposta dele" e "Usar a minha" avisam a ficha com a chave do campo', () => {
    const onManter = vi.fn();
    const onUsar = vi.fn();
    render(
      <FichaField
        campo={campoDe('3.3')}
        onDecide={vi.fn()}
        conflito={conflitoDe('3.3')}
        onManterDoSocio={onManter}
        onUsarAMinha={onUsar}
        meuEmail={EU}
      />,
    );
    fireEvent.click(screen.getByText(COPY_MANTER));
    expect(onManter).toHaveBeenCalledWith('3.3');
    fireEvent.click(screen.getByText(COPY_USAR_MINHA));
    expect(onUsar).toHaveBeenCalledWith('3.3');
  });

  it('sem conflito não desenha aviso nenhum', () => {
    render(<FichaField campo={campoDe('3.3')} onDecide={vi.fn()} meuEmail={EU} />);
    expect(screen.queryByTestId('aviso-socio-3.3')).toBeNull();
  });
});

describe('"respondido por" no campo', () => {
  const decididoPeloSocio = campoDe('3.4', {
    status: 'editado',
    valor: 'O desejo, pelo Gustavo',
    valor_efetivo: 'O desejo, pelo Gustavo',
    decidido: true,
    atualizado_por: SOCIO.email,
    atualizado_em: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    decidido_por: SOCIO,
    rev: 2,
  });

  it('aparece quando quem respondeu foi o sócio', () => {
    render(<FichaField campo={decididoPeloSocio} onDecide={vi.fn()} meuEmail={EU} />);
    expect(screen.getByTestId('respondido-por-3.4').textContent).toBe('respondido por Gustavo há 5 minutos');
  });

  it('não aparece no campo que eu mesma respondi', () => {
    const meu = { ...decididoPeloSocio, atualizado_por: EU, decidido_por: { email: EU, nome: 'Ana Prado' } };
    render(<FichaField campo={meu} onDecide={vi.fn()} meuEmail={EU} />);
    expect(screen.queryByTestId('respondido-por-3.4')).toBeNull();
  });
});
