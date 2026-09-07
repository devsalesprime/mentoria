import React from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';

/**
 * "Gerar apresentação" em duas etapas (onda E4, pedido do dono em 07/09).
 *
 * Etapa 1 ("aviso"): a apresentação nasce desta versão do script, então antes de gerar a gente pergunta se a pessoa
 * não prefere mandar as observações e pedir os ajustes (a rodada de ajustes é uma só).
 * Etapa 2 ("confirmar"): confirma a versão e avisa que a apresentação não se atualiza sozinha depois.
 * Só depois da etapa 2 a tela chama o endpoint.
 */
export type EtapaApresentacao = 'aviso' | 'confirmar';

export const COPY_APRES_ETAPA1_TITULO = 'Antes de gerar a apresentação';
export const COPY_APRES_ETAPA1_TEXTO = 'A apresentação é montada a partir desta versão do script. Quer antes enviar observações e pedir ajustes? Você tem uma rodada de ajustes incluída.';
export const COPY_APRES_AJUSTAR = 'Quero ajustar antes';
export const COPY_APRES_GERAR = 'Gerar com esta versão';
export const COPY_APRES_CONFIRMAR = 'Confirmar';
export const COPY_APRES_VOLTAR = 'Voltar';

export function textoConfirmacao(versao: number | null | undefined): string {
  const v = versao != null ? `v${versao}` : 'esta versão';
  return `Confirmar: gerar a apresentação a partir da versão ${v}. Depois de gerada, novos ajustes no script não mudam a apresentação automaticamente.`;
}

interface ConfirmarApresentacaoModalProps {
  etapa: EtapaApresentacao | null;
  versao: number | null;
  /** true enquanto o pedido está indo para o servidor. */
  gerando?: boolean;
  onAjustar: () => void;
  onAvancar: () => void;
  onVoltar: () => void;
  onConfirmar: () => void;
  onClose: () => void;
}

export const ConfirmarApresentacaoModal: React.FC<ConfirmarApresentacaoModalProps> = ({
  etapa, versao, gerando, onAjustar, onAvancar, onVoltar, onConfirmar, onClose,
}) => (
  <Modal isOpen={etapa != null} onClose={onClose} size="md">
    {etapa === 'confirmar' ? (
      <div className="space-y-4" data-testid="modal-apresentacao-confirmar">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Apresentação comercial</p>
          <h3 className="font-serif text-2xl text-white leading-tight mt-1">Confirmar a versão</h3>
        </div>
        <p className="text-sm text-white/80 leading-relaxed" data-testid="apres-texto-confirmar">{textoConfirmacao(versao)}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="md" onClick={onVoltar} disabled={gerando} data-testid="apres-voltar">{COPY_APRES_VOLTAR}</Button>
          <Button variant="primary" size="md" onClick={onConfirmar} loading={gerando} disabled={gerando} data-testid="apres-confirmar">{COPY_APRES_CONFIRMAR}</Button>
        </div>
      </div>
    ) : (
      <div className="space-y-4" data-testid="modal-apresentacao-aviso">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Apresentação comercial</p>
          <h3 className="font-serif text-2xl text-white leading-tight mt-1">{COPY_APRES_ETAPA1_TITULO}</h3>
        </div>
        <p className="text-sm text-white/80 leading-relaxed" data-testid="apres-texto-aviso">{COPY_APRES_ETAPA1_TEXTO}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="md" onClick={onAjustar} data-testid="apres-ajustar">{COPY_APRES_AJUSTAR}</Button>
          <Button variant="primary" size="md" onClick={onAvancar} data-testid="apres-avancar">{COPY_APRES_GERAR}</Button>
        </div>
      </div>
    )}
  </Modal>
);

export default ConfirmarApresentacaoModal;
