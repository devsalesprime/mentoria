import React, { useEffect, useRef, useState } from 'react';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import { fraseDoTempoMaiuscula, useTemposScript } from '../../hooks/useEsperaScript';
import { AmostraScript } from './AmostraScript';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

/**
 * "Como funciona" (onda I, item I1, decisao D1): a primeira tela de quem entra no Script 7 Passos,
 * ANTES da escolha entre essencial e completo. Ela responde duas perguntas que hoje ficam no ar:
 * o que a pessoa vai receber e quanto tempo leva. Um botao so, "Começar o meu script".
 *
 * Aparece sozinha na PRIMEIRA entrada (o servidor guarda `visto_como_funciona` por pessoa) e, depois
 * disso, vive no menu, como primeiro item do Script 7 Passos. A marca e gravada quando a tela ABRE, nao
 * so no clique do botao: quem leu e seguiu pelo menu nao merece ver "Como funciona" como etapa pendente
 * no trilho pelo resto do caminho. Gravar de novo nao muda nada (o servidor mantem a primeira data).
 *
 * Os tempos das etapas vem do historico real (GET /api/script/tempos, item I3). Sem historico, a linha
 * da etapa sai sem numero nenhum: nada de prazo inventado.
 *
 * O bloco "Ver um script completo de exemplo" so aparece quando o admin configurou a amostra
 * (`config.amostra_disponivel`); ele abre o leitor em modo leitura (AmostraScript).
 */

export const TITULO_COMO_FUNCIONA = 'Como funciona o seu script dos 7 passos';
export const COPY_ENTRADA =
  'O Prosperus monta o script de venda da sua mentoria nos 7 passos da Dani Martins. Quanto mais contexto você mandar, mais o script sai com a sua voz e com os números reais da sua mentoria.';
export const COPY_COMECAR = 'Começar o meu script';
export const COPY_VER_EXEMPLO = 'Ver um script completo de exemplo';
export const COPY_NADA_SE_PERDE = 'Você pode fechar e voltar quando quiser. Nada se perde.';

/** (a) O que você recebe. */
export const RECEBE: Array<{ titulo: string; texto: string }> = [
  {
    titulo: 'Cartão de bolso',
    texto: 'A folha que vai com você para a reunião: as falas-chave dos 7 passos, o investimento total e a pergunta de recomendação.',
  },
  {
    titulo: 'Script completo',
    texto: 'As falas na ordem, o porquê de cada uma, os perfis de cliente, os treinamentos de cada passo e a apresentação comercial em PPTX.',
  },
];

/** (c) O que vale mais mandar. */
export const VALE_MAIS: string[] = [
  'Reunião de venda gravada ou transcrita',
  'Proposta ou tabela de preço',
  'Apostila ou desenho do seu método',
];

/** (b) As 4 etapas. `tempo` diz de qual trabalho sai o número; sem número, fica a frase de apoio. */
type EtapaTempo = 'prefill' | 'script' | null;
export const ETAPAS: Array<{ nome: string; linha: string; tempo: EtapaTempo }> = [
  { nome: 'Escolha', linha: 'Você decide começar pelo essencial ou pelo script completo.', tempo: null },
  { nome: 'Materiais', linha: 'Você manda o que já usa para vender, ou segue sem material.', tempo: 'prefill' },
  { nome: 'Ficha', linha: 'As respostas chegam prontas, com a fonte ao lado: você confirma, ajusta ou preenche.', tempo: null },
  { nome: 'Script', linha: 'O script sai na sua voz, para ler, grifar, baixar e levar para a reunião.', tempo: 'script' },
];

/** Frase de apoio de cada etapa quando ainda não há histórico para citar um número. */
const SEM_NUMERO: Record<string, string> = {
  Escolha: 'Leva um minuto.',
  Materiais: 'A leitura começa assim que você envia. Você não precisa esperar na tela.',
  Ficha: 'No seu ritmo, com o que já veio preenchido.',
  Script: 'Avisamos no seu WhatsApp quando ficar pronto.',
};

/**
 * Complemento depois do número. O tempo já vem com o sujeito ("A nossa leitura dos seus materiais..."),
 * porque o número solto era lido como esforço de quem está na tela.
 */
const DEPOIS_DO_NUMERO: Record<string, string> = {
  Materiais: ' Você não precisa esperar na tela.',
};

interface ComoFuncionaScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
}

export const ComoFuncionaScreen: React.FC<ComoFuncionaScreenProps> = ({ ficha, token, onNavigate }) => {
  const { data, loading, loaded, error, marcarComoFuncionaVisto, rotaDepoisDaEntrada } = ficha;
  const { medianaDe } = useTemposScript(token, !!token);
  const [verAmostra, setVerAmostra] = useState(false);
  const [seguindo, setSeguindo] = useState(false);
  const jaVista = !!data?.visto_como_funciona;
  const jaTentou = useRef(false);

  // Abrir a tela ja conta como ver (o botao continua levando adiante). Uma gravacao por visita:
  // o `ref` segura o caso raro de a marca nao colar no servidor, para nao virar uma chamada por atualizacao.
  useEffect(() => {
    if (!data || jaVista || jaTentou.current) return;
    jaTentou.current = true;
    void marcarComoFuncionaVisto();
  }, [data, jaVista, marcarComoFuncionaVisto]);

  if (loading && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 min-h-[300px] flex items-center justify-center">
        <LoadingSpinner size="lg" label="Carregando" />
      </div>
    );
  }

  if (loaded && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 text-center space-y-3">
        <h3 className="font-serif text-2xl text-white">Script 7 Passos</h3>
        <p className="text-sm text-white/60 font-sans">{error || 'Esta área ainda não está liberada para o seu acesso. Fale com o Caio.'}</p>
      </div>
    );
  }

  if (!data) return null;

  if (verAmostra) {
    return <AmostraScript token={token} onVoltar={() => setVerAmostra(false)} />;
  }

  const comecar = async () => {
    setSeguindo(true);
    await marcarComoFuncionaVisto();
    setSeguindo(false);
    onNavigate?.(rotaDepoisDaEntrada());
  };

  const tempoDaEtapa = (nome: string, tipo: EtapaTempo): string => {
    const frase = tipo ? fraseDoTempoMaiuscula(tipo, medianaDe(tipo)) : null;
    if (frase) return `${frase}.${DEPOIS_DO_NUMERO[nome] || ''}`;
    return SEM_NUMERO[nome] || '';
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto" data-testid="como-funciona-screen">
      {/* Papel creme, como o resto da leitura */}
      <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
        <h2 className="font-serif text-2xl sm:text-3xl text-prosperus-navy leading-tight">{TITULO_COMO_FUNCIONA}</h2>
        <p className="text-sm text-prosperus-navy/75 font-sans leading-relaxed">{COPY_ENTRADA}</p>
      </div>

      {/* (a) O que você recebe */}
      <section className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-3" aria-label="O que você recebe">
        <h3 className="font-serif text-xl sm:text-2xl text-prosperus-navy">O que você recebe</h3>
        <ul className="space-y-2">
          {RECEBE.map((r) => (
            <li key={r.titulo} className="text-sm text-prosperus-navy/80 font-sans leading-relaxed">
              <span className="font-semibold text-prosperus-navy">{r.titulo}.</span> {r.texto}
            </li>
          ))}
        </ul>
        {data.config?.amostra_disponivel && (
          <Button
            variant="secondary"
            size="md"
            className="min-h-[44px]"
            data-testid="ver-amostra"
            onClick={() => setVerAmostra(true)}
          >
            {COPY_VER_EXEMPLO}
          </Button>
        )}
      </section>

      {/* (b) As 4 etapas */}
      <section className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-3" aria-label="As 4 etapas">
        <h3 className="font-serif text-xl sm:text-2xl text-prosperus-navy">As 4 etapas</h3>
        <ol className="space-y-3">
          {ETAPAS.map((e, i) => (
            <li key={e.nome} className="flex gap-3" data-testid={`etapa-${e.nome.toLowerCase()}`}>
              <span className="font-serif text-lg text-prosperus-gold-dark flex-shrink-0" aria-hidden="true">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-serif text-lg text-prosperus-navy leading-snug">{e.nome}</span>
                <span className="block text-sm text-prosperus-navy/75 font-sans leading-relaxed">{e.linha}</span>
                <span className="block text-xs text-prosperus-navy/55 font-sans" data-testid={`etapa-tempo-${e.nome.toLowerCase()}`}>
                  {tempoDaEtapa(e.nome, e.tempo)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* (c) O que vale mais mandar */}
      <section className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-3" aria-label="O que vale mais mandar">
        <h3 className="font-serif text-xl sm:text-2xl text-prosperus-navy">O que vale mais mandar</h3>
        <ul className="space-y-1.5">
          {VALE_MAIS.map((v) => (
            <li key={v} className="text-sm text-prosperus-navy/80 font-sans leading-relaxed">{v}</li>
          ))}
        </ul>
      </section>

      {/* (d) Uma linha e o botão */}
      <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-3">
        <p className="text-sm text-prosperus-navy/75 font-sans">{COPY_NADA_SE_PERDE}</p>
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto min-h-[48px]"
          data-testid="comecar-script"
          onClick={comecar}
          loading={seguindo}
          disabled={seguindo}
        >
          {COPY_COMECAR}
        </Button>
      </div>
    </div>
  );
};

export default ComoFuncionaScreen;
