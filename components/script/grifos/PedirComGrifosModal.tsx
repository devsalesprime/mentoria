import React, { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { COR_ROTULO, fraseResumo, resumoGrifos, type Grifo } from './types';
import { nomeTela } from '../script/telas';

/**
 * "Pedir nova versão com os grifos": resumo (N grifos: x ajustar, y manter, z tirar), a lista curta e o campo
 * "Alguma orientação geral?". Ao confirmar, a tela chama a revisão com os grifos convertidos em comentários.
 */
interface PedirComGrifosModalProps {
  isOpen: boolean;
  grifos: Grifo[];
  versao: number | null;
  onClose: () => void;
  onConfirmar: (orientacao: string) => Promise<void>;
}

const MAX_LISTA = 8;

export const PedirComGrifosModal: React.FC<PedirComGrifosModalProps> = ({ isOpen, grifos, versao, onClose, onConfirmar }) => {
  const [orientacao, setOrientacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const resumo = resumoGrifos(grifos);
  const confirmar = async () => {
    setEnviando(true);
    try { await onConfirmar(orientacao.trim()); } finally { setEnviando(false); }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="space-y-4" data-testid="modal-grifos">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Nova versão</p>
          <h3 className="font-serif text-2xl text-white leading-tight mt-1">Pedir nova versão com os grifos</h3>
          <p className="text-sm text-white/70 mt-2 leading-relaxed">
            A próxima versão parte {versao != null ? `da versão ${versao}` : 'desta versão'} e atende cada grifo: o verde fica como está, o vermelho sai, o dourado é reescrito conforme a sua nota.
          </p>
        </div>
        <p className="text-sm text-prosperus-gold-light font-semibold" data-testid="resumo-grifos">{fraseResumo(resumo)}</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {grifos.slice(0, MAX_LISTA).map((g) => (
            <li key={g.id} className="text-xs text-white/70 leading-snug">
              <span className={`script-grifo-bolinha script-grifo-bolinha-${g.cor} align-middle mr-1.5`} aria-hidden="true" />
              <span className="text-white/90 font-semibold">{COR_ROTULO[g.cor]}</span>
              <span className="text-white/40"> · {nomeTela(g.passo)}</span>
              {' '}«{g.texto.length > 80 ? `${g.texto.slice(0, 79)}…` : g.texto}»{g.nota ? ` → ${g.nota}` : ''}
            </li>
          ))}
          {grifos.length > MAX_LISTA && <li className="text-xs text-white/50">e mais {grifos.length - MAX_LISTA}.</li>}
        </ul>
        <label className="block">
          <span className="text-xs text-white/70">Alguma orientação geral? (opcional)</span>
          <textarea
            value={orientacao}
            onChange={(e) => setOrientacao(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Ex.: falas mais curtas no passo 2; manter o tom direto."
            className="mt-1 w-full bg-prosperus-navy-mid border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-prosperus-gold-dark min-h-[72px]"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="md" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" size="md" onClick={confirmar} loading={enviando} disabled={enviando || grifos.length === 0}>Pedir nova versão</Button>
        </div>
      </div>
    </Modal>
  );
};

export default PedirComGrifosModal;
