import React, { useState } from 'react';
import { ConsentimentoWhatsApp, type ConsentimentoDados } from './materiais/ConsentimentoWhatsApp';
import { linhaDeEspera, useFilaScript, useTemposScript, type FilaTipo } from '../../hooks/useEsperaScript';

/**
 * A previsao das duas esperas (onda I, item I4): a leitura dos materiais e a escrita do script.
 *
 * Uma linha com a fila e o tempo ("2 na frente: Ceramfix e Laser Tech · costuma levar cerca de 12 min",
 * decisao D8) e, embaixo, o WhatsApp: quem ja deu a permissao le que pode fechar a aba; quem nao deu
 * recebe UM lembrete. Dispensou o lembrete? A marca fica no servidor (PUT /api/script/visto) e ele
 * nao volta mais: ninguem e cobrado duas vezes pelo mesmo numero.
 *
 * O numero nunca e inventado: sem historico, a linha sai so com a fila; sem fila, so com o tempo.
 */

export const COPY_PODE_FECHAR = 'Pode fechar. Avisamos no seu WhatsApp.';
export const COPY_LEMBRETE_TITULO = 'Quer receber o aviso no WhatsApp?';
export const COPY_LEMBRETE_DISPENSAR = 'Seguir sem o aviso';

interface EtaEsperaProps {
  token: string;
  /** 'prefill' = leitura dos materiais; 'script' = escrita do script. */
  tipo: FilaTipo;
  /** Liga a leitura da fila (a espera esta mesmo acontecendo). */
  ativo?: boolean;
  /** A pessoa ja autorizou o aviso no WhatsApp. */
  temWhatsapp?: boolean;
  /** Numero do cadastro, so para pre-preencher o campo do lembrete. */
  sugerido?: string | null;
  /** Grava o numero com a permissao (o mesmo caminho das outras telas). */
  onConfirmarWhats?: (dados: ConsentimentoDados) => Promise<{ ok: boolean; message?: string }>;
  /** A pessoa ja dispensou o lembrete alguma vez: ele nao volta. */
  lembreteDispensado?: boolean;
  /** Marca a dispensa no servidor. */
  onDispensarLembrete?: () => void;
  /** id do input do WhatsApp (unico por tela). */
  id?: string;
  testId?: string;
}

export const EtaEspera: React.FC<EtaEsperaProps> = ({
  token, tipo, ativo = true, temWhatsapp = false, sugerido, onConfirmarWhats,
  lembreteDispensado = false, onDispensarLembrete, id, testId = 'eta-espera',
}) => {
  const { medianaDe } = useTemposScript(token, !!token);
  const { fila } = useFilaScript(token, tipo, !!token && ativo);
  const [dispensadoAqui, setDispensadoAqui] = useState(false);

  const linha = linhaDeEspera(fila, tipo, medianaDe(tipo));
  const mostrarLembrete = !temWhatsapp && !lembreteDispensado && !dispensadoAqui && !!onConfirmarWhats;

  const dispensar = () => {
    setDispensadoAqui(true);
    onDispensarLembrete?.();
  };

  if (!linha && !temWhatsapp && !mostrarLembrete) return null;

  return (
    <div className="space-y-2" data-testid={testId}>
      {linha && (
        <p className="text-sm text-prosperus-gold-light font-sans" data-testid={`${testId}-linha`}>{linha}</p>
      )}
      {temWhatsapp ? (
        <p className="text-xs text-white/60 font-sans" data-testid={`${testId}-whatsapp-ok`}>{COPY_PODE_FECHAR}</p>
      ) : mostrarLembrete ? (
        <div className="rounded-lg border border-white/10 p-3 space-y-2" data-testid={`${testId}-lembrete`}>
          <ConsentimentoWhatsApp
            id={id || `${testId}-whatsapp`}
            titulo={COPY_LEMBRETE_TITULO}
            sugerido={sugerido}
            onConfirmar={onConfirmarWhats!}
            testId={`${testId}-consentimento`}
          />
          <button
            type="button"
            onClick={dispensar}
            className="min-h-[44px] text-xs text-white/50 hover:text-white/80 font-sans underline underline-offset-4"
            data-testid={`${testId}-dispensar`}
          >
            {COPY_LEMBRETE_DISPENSAR}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default EtaEspera;
