import React, { useCallback } from 'react';
import { MateriaisScreen } from './MateriaisScreen';
import { FichaScreen } from './FichaScreen';
import { esperandoPrimeiraSugestao, etapaInicialMateriaisFicha, type EtapaMateriaisFicha, type UseScriptFicha } from '../../hooks/useScriptFicha';

/**
 * "Base do script" (onda J, SPEC-workflow-v4-decisoes-08-09, item 4; renomeada a pedido do dono em 09/09,
 * item 2): as duas telas que antes viviam separadas no menu passam a ser UMA tela com duas etapas internas,
 * num seletor curto no alto do conteúdo. O endereço (`materiais-ficha`) e os ids de rota continuam os mesmos.
 *
 * A etapa 1 monta a `MateriaisScreen` e a etapa 2 monta a `FichaScreen`, as duas como estavam. A espera da
 * leitura (onda I, item I5) continua sendo a `FichaScreen` em modo `espera`: ela é o rosto da etapa 2
 * enquanto a leitura roda e nenhuma sugestão chegou.
 *
 * A etapa é CONTROLADA por quem chama (o Dashboard): sem valor, ela sai das regras de sempre
 * (`etapaInicialMateriaisFicha`), as mesmas que decidiam entre as três telas antigas. Os botões de dentro das
 * duas telas continuam pedindo "script_ficha" ou "script_materiais": aqui isso vira troca de etapa, sem sair
 * da tela; qualquer outro destino sobe para o Dashboard.
 */

/** Nome visível da tela, em todo lugar: menu, título do topo, "Como funciona" e avisos. */
export const ROTULO_BASE_DO_SCRIPT = 'Base do script';

export const ROTULO_ETAPA_MATERIAIS = 'Materiais';
export const ROTULO_ETAPA_FICHA = 'Ficha';

interface MateriaisFichaScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
  /** Etapa aberta agora; sem ela, a etapa sai das regras da rota inicial. */
  etapa?: EtapaMateriaisFicha;
  /** Trocar de etapa (o estado vive em quem chama, para sobreviver a uma remontagem). */
  onEtapa?: (etapa: EtapaMateriaisFicha) => void;
}

const ETAPAS: Array<{ id: 'materiais' | 'ficha'; numero: number; rotulo: string }> = [
  { id: 'materiais', numero: 1, rotulo: ROTULO_ETAPA_MATERIAIS },
  { id: 'ficha', numero: 2, rotulo: ROTULO_ETAPA_FICHA },
];

export const MateriaisFichaScreen: React.FC<MateriaisFichaScreenProps> = ({ ficha, token, onNavigate, etapa, onEtapa }) => {
  const dados = ficha.data;
  const escolhida: EtapaMateriaisFicha = etapa || etapaInicialMateriaisFicha(dados);

  const trocar = useCallback((proxima: EtapaMateriaisFicha) => { onEtapa?.(proxima); }, [onEtapa]);

  /** Os pedidos internos das duas telas viram troca de etapa; o resto segue para o Dashboard. */
  const navegar = useCallback((id: string) => {
    if (id === 'script_materiais') { trocar('materiais'); return; }
    if (id === 'script_ficha') { trocar('ficha'); return; }
    if (id === 'script_espera') { trocar('espera'); return; }
    onNavigate?.(id);
  }, [onNavigate, trocar]);

  // A espera da leitura é o rosto da etapa 2 enquanto nenhuma sugestão chegou.
  const naEspera = escolhida === 'espera' || (escolhida === 'ficha' && esperandoPrimeiraSugestao(dados));
  const aba: 'materiais' | 'ficha' = escolhida === 'materiais' ? 'materiais' : 'ficha';

  return (
    <div className="space-y-4" data-testid="materiais-ficha-screen" data-etapa={naEspera ? 'espera' : aba}>
      <div className="script-etapas" role="group" aria-label="Etapas da base do script" data-testid="materiais-ficha-etapas">
        {ETAPAS.map((e) => {
          const ativa = aba === e.id;
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={ativa}
              data-testid={`etapa-${e.id}`}
              onClick={() => trocar(e.id)}
              className={`script-etapas-btn ${ativa ? 'script-etapas-btn-ativa' : ''}`}
            >
              <span className="script-etapas-num" aria-hidden="true">{e.numero}</span>
              {e.rotulo}
            </button>
          );
        })}
      </div>

      {aba === 'materiais' ? (
        <MateriaisScreen ficha={ficha} token={token} onNavigate={navegar} />
      ) : (
        <FichaScreen ficha={ficha} token={token} espera={naEspera} onNavigate={navegar} />
      )}
    </div>
  );
};

export default MateriaisFichaScreen;
