import React, { useState } from 'react';
import { COR_ROTULO, GRIFO_NOTA_MAX, mesmoEmail, primeiroNome, type Grifo } from './types';
import { nomeTela, TOTAL_TELAS } from '../script/telas';

/**
 * "Seus grifos": lista agrupada por tela (cor, trecho, nota, autor, "ir para", "editar nota", "apagar" so do autor).
 * No desktop fica ao lado do leitor; no celular, numa folha no rodape. O grifo cujo trecho nao existe mais nesta versao
 * aparece com "trecho não encontrado nesta versão".
 */
interface GrifosPanelProps {
  grifos: Grifo[];
  encontrado: (g: Grifo) => boolean;
  meuEmail: string | null;
  nomeDoPasso: (n: number) => string;
  onIrPara: (g: Grifo) => void;
  onEditarNota: (g: Grifo, nota: string) => Promise<boolean>;
  onApagar: (g: Grifo) => Promise<boolean>;
  onFechar?: () => void;
}

function truncar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const Item: React.FC<{
  g: Grifo;
  achado: boolean;
  meu: boolean;
  onIrPara: () => void;
  onEditarNota: (nota: string) => Promise<boolean>;
  onApagar: () => Promise<boolean>;
}> = ({ g, achado, meu, onIrPara, onEditarNota, onApagar }) => {
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(g.nota || '');
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setOcupado(true);
    const ok = await onEditarNota(nota.trim());
    setOcupado(false);
    if (ok) setEditando(false);
  };
  const apagar = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Apagar este grifo?')) return;
    setOcupado(true);
    await onApagar();
    setOcupado(false);
  };
  return (
    <li className={`script-grifo-item script-grifo-item-${g.cor}`} data-testid="grifo-item">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-prosperus-navy-panel/70">
        <span className={`script-grifo-bolinha script-grifo-bolinha-${g.cor}`} aria-hidden="true" />
        <span>{COR_ROTULO[g.cor]}</span>
        <span className="normal-case tracking-normal font-normal text-prosperus-navy-panel/50">por {primeiroNome(g.autor_nome, g.autor_email)}</span>
        {g.resolvido_em && <span className="normal-case tracking-normal font-normal text-green-700">atendido</span>}
      </div>
      <p className="script-grifo-trecho">«{truncar(g.texto, 140)}»</p>
      {!achado && <p className="text-[11px] text-red-700">trecho não encontrado nesta versão</p>}
      {editando ? (
        <div className="mt-1 space-y-1">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, GRIFO_NOTA_MAX))}
            maxLength={GRIFO_NOTA_MAX}
            rows={2}
            aria-label="Nota do grifo"
            className="w-full bg-white border border-prosperus-navy-panel/20 rounded-lg px-2 py-1.5 text-sm text-prosperus-neutral-black outline-none focus:border-prosperus-gold-dark"
          />
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => { setEditando(false); setNota(g.nota || ''); }} className="script-grifo-acao">Cancelar</button>
            <button type="button" onClick={salvar} disabled={ocupado} className="script-grifo-acao script-grifo-acao-forte">Salvar nota</button>
          </div>
        </div>
      ) : (
        g.nota && <p className="text-sm text-prosperus-neutral-black leading-snug whitespace-pre-line">{g.nota}</p>
      )}
      {!editando && (
        <div className="flex flex-wrap gap-1 mt-1">
          <button type="button" onClick={onIrPara} className="script-grifo-acao">Ir para</button>
          {meu && !g.resolvido_em && <button type="button" onClick={() => setEditando(true)} className="script-grifo-acao">Editar nota</button>}
          {meu && <button type="button" onClick={apagar} disabled={ocupado} className="script-grifo-acao script-grifo-acao-apagar">Apagar</button>}
        </div>
      )}
    </li>
  );
};

export const GrifosPanel: React.FC<GrifosPanelProps> = ({ grifos, encontrado, meuEmail, nomeDoPasso, onIrPara, onEditarNota, onApagar, onFechar }) => {
  const porTela: Grifo[][] = Array.from({ length: TOTAL_TELAS }, () => []);
  for (const g of grifos) porTela[Math.max(0, Math.min(TOTAL_TELAS - 1, g.passo))].push(g);
  return (
    <section aria-label="Seus grifos" className="script-grifos-painel" data-testid="grifos-painel">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-serif text-lg text-prosperus-navy-panel">Seus grifos</h3>
        {onFechar && <button type="button" onClick={onFechar} className="script-grifo-acao">Fechar</button>}
      </div>
      {grifos.length === 0 ? (
        <p className="text-sm text-prosperus-navy-panel/70 leading-relaxed">
          Selecione um trecho do script e escolha uma cor: dourado para ajustar, verde para manter, vermelho para tirar. Os grifos entram na próxima versão.
        </p>
      ) : (
        <div className="space-y-3">
          {porTela.map((lista, tela) => lista.length === 0 ? null : (
            <div key={tela}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-prosperus-navy-panel/50 font-semibold mb-1">
                {nomeTela(tela, tela >= 2 && tela <= 8 ? nomeDoPasso(tela - 1) : undefined)}
              </p>
              <ul className="space-y-2">
                {lista.map((g) => (
                  <Item
                    key={g.id}
                    g={g}
                    achado={encontrado(g)}
                    meu={mesmoEmail(g.autor_email, meuEmail)}
                    onIrPara={() => onIrPara(g)}
                    onEditarNota={(nota) => onEditarNota(g, nota)}
                    onApagar={() => onApagar(g)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default GrifosPanel;
