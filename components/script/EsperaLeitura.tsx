import React from 'react';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import { ProgressoPreenchimento } from './ProgressoPreenchimento';
import { EtaEspera } from './EtaEspera';
import { Button } from '../ui/Button';

/**
 * Espera explicita antes da ficha (onda I, item I5): quem enviou os materiais e ainda nao recebeu
 * nenhuma sugestao caia numa ficha crua, sem nada preenchido, e era isso que cansava. Agora a tela diz
 * o que esta acontecendo, quanto costuma levar e quantos clubes estao na frente.
 *
 * Um botao secundario ("Responder enquanto a IA lê") abre a ficha por ESCOLHA, nunca por padrao.
 * Assim que a primeira sugestao chega, a ficha volta a ser o destino (quem faz isso e a FichaScreen,
 * que ja sincroniza a cada 20 s).
 */

export const COPY_ESPERA_TITULO = 'Estamos lendo os seus materiais';
export const COPY_ESPERA_TEXTO =
  'As respostas vão aparecer na sua ficha conforme a leitura avança, cada uma com a fonte ao lado. Você não precisa ficar nesta tela.';
export const COPY_RESPONDER_ANTES = 'Responder enquanto a IA lê';

interface EsperaLeituraProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
}

export const EsperaLeitura: React.FC<EsperaLeituraProps> = ({ ficha, token, onNavigate }) => {
  const { data, ultimaSincronia, salvarNotifyPhone, marcarLembreteWhatsapp } = ficha;
  if (!data) return null;
  const job = data.job || null;
  const ativo = job?.status === 'queued' || job?.status === 'running';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto" data-testid="espera-leitura">
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
        <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">{COPY_ESPERA_TITULO}</h2>
        <p className="text-sm text-white/70 font-sans leading-relaxed">{COPY_ESPERA_TEXTO}</p>
      </div>

      <ProgressoPreenchimento
        job={job}
        sugestoes={0}
        atualizadoEm={ultimaSincronia ?? null}
        eta={(
          <EtaEspera
            token={token}
            tipo="prefill"
            ativo={ativo}
            temWhatsapp={!!data.materials?.notify_phone}
            sugerido={data.materials?.notify_phone_sugerido}
            onConfirmarWhats={salvarNotifyPhone}
            lembreteDispensado={!!data.visto_whatsapp_lembrete}
            onDispensarLembrete={marcarLembreteWhatsapp}
            id="espera-leitura-whatsapp"
            testId="eta-prefill"
          />
        )}
      />

      {onNavigate && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            className="min-h-[44px]"
            data-testid="responder-enquanto-le"
            onClick={() => onNavigate('script_ficha')}
          >
            {COPY_RESPONDER_ANTES}
          </Button>
          <Button variant="ghost" size="md" className="min-h-[44px]" onClick={() => onNavigate('script_materiais')}>
            Enviar mais materiais
          </Button>
        </div>
      )}
    </div>
  );
};

export default EsperaLeitura;
