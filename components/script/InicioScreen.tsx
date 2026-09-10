/**
 * Tela de Início (decisão do Danilo, 10/09): a primeira tela do membro depois da explicação inicial.
 * Ela responde três perguntas com o estado real da ficha, sem o membro abrir nada:
 *   Base do script  -> os materiais foram enviados e quantas respostas já estão confirmadas
 *   Seu script      -> qual é a versão de hoje, se ela está aprovada ou em rascunho, quantos ajustes sobram
 *   Apresentação    -> se a apresentação comercial já saiu de alguma versão
 * "Continuar de onde parei" usa a mesma regra de sempre (rotaInicialDoClube), então o botão leva a pessoa
 * exatamente para onde ela cairia ao entrar no app.
 * Quem tem a versão anterior concluída ganha um quarto cartão para voltar às telas antigas.
 * Tudo aqui vem do payload de GET /api/script/ficha; esta tela não faz chamada nenhuma.
 */
import React from 'react';
import type { UseScriptFicha, ScriptFichaData } from '../../hooks/useScriptFicha';
import { rotaInicialDoClube } from '../../hooks/useScriptFicha';
import { ROTULO_BASE_DO_SCRIPT } from './MateriaisFichaScreen';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

interface InicioScreenProps {
  ficha: UseScriptFicha;
  /** Nome de quem está logado, para o cumprimento. */
  nome: string;
  onNavigate?: (id: string) => void;
  /** Mostra o quarto cartão (só para quem concluiu ou foi marcado na versão anterior). */
  temVersaoAnterior?: boolean;
  /** Revela a versão anterior no menu e abre a tela antiga. */
  onVersaoAnterior?: () => void;
}

/** "Materiais enviados." / "Você seguiu sem enviar materiais." / "Materiais ainda não enviados." */
export function linhaDosMateriais(data: Pick<ScriptFichaData, 'materials_status'>): string {
  if (data.materials_status === 'submitted') return 'Materiais enviados.';
  if (data.materials_status === 'skipped') return 'Você seguiu sem enviar materiais.';
  return 'Materiais ainda não enviados.';
}

/** "Ficha: 12 de 34 confirmados." Sem perguntas abertas, a ficha ainda não começou. */
export function linhaDaFicha(data: Pick<ScriptFichaData, 'progresso'>): string {
  const total = data.progresso?.obrigatorios || 0;
  if (!total) return 'Ficha ainda não começou.';
  return `Ficha: ${data.progresso.obrigatorios_decididos || 0} de ${total} confirmados.`;
}

/** "Versão 3 aprovada." / "Versão 3 em rascunho." / "O seu script está sendo escrito." / "Nenhuma versão escrita ainda." */
export function linhaDoScript(data: Pick<ScriptFichaData, 'script'>): string {
  const s = data.script;
  if (s?.aprovada) return `Versão ${s.aprovada} aprovada.`;
  if (s?.ultima) return `Versão ${s.ultima.versao} em rascunho.`;
  const job = s?.job;
  if (job && (job.status === 'queued' || job.status === 'running')) return 'O seu script está sendo escrito.';
  return 'Nenhuma versão escrita ainda.';
}

/** Quantos pedidos de nova versão ainda cabem; `null` antes da primeira versão (não há o que pedir). */
export function ajustesRestantes(data: Pick<ScriptFichaData, 'script'>): number | null {
  const s = data.script;
  if (!s || !s.versoes) return null;
  const limite = Number.isFinite(Number(s.ajustes_limite)) ? Number(s.ajustes_limite) : 1;
  const usados = Number(s.ajustes_usados) || 0;
  return Math.max(0, limite - usados);
}

export function linhaDosAjustes(restantes: number): string {
  if (restantes === 0) return 'Sem pedidos de ajuste restantes.';
  if (restantes === 1) return 'Resta 1 pedido de ajuste.';
  return `Restam ${restantes} pedidos de ajuste.`;
}

/** Maior versão que já tem apresentação comercial publicada (entregável `slides`); `null` sem nenhuma. */
export function versaoComApresentacao(data: Pick<ScriptFichaData, 'script'>): number | null {
  const porVersao = data.script?.entregaveis || {};
  const versoes = Object.entries(porVersao)
    .filter(([, itens]) => (itens || []).some((e) => e && e.tipo === 'slides' && (e.arquivos || []).length > 0))
    .map(([v]) => Number(v))
    .filter((v) => Number.isFinite(v));
  return versoes.length ? Math.max(...versoes) : null;
}

const Cartao: React.FC<{
  testId: string;
  titulo: string;
  linhas: string[];
  botao?: { rotulo: string; onClick: () => void; testId: string };
}> = ({ testId, titulo, linhas, botao }) => (
  <section
    aria-label={titulo}
    data-testid={testId}
    className="bg-prosperus-navy-panel border border-white/10 rounded-lg p-4 sm:p-5 flex flex-col gap-2"
  >
    <h3 className="font-serif text-lg sm:text-xl text-white">{titulo}</h3>
    <div className="flex-1 space-y-1">
      {linhas.map((l) => (
        <p key={l} className="text-sm text-white/70 font-sans leading-relaxed">{l}</p>
      ))}
    </div>
    {botao && (
      <Button variant="secondary" size="sm" className="w-full mt-1" data-testid={botao.testId} onClick={botao.onClick}>
        {botao.rotulo}
      </Button>
    )}
  </section>
);

export const InicioScreen: React.FC<InicioScreenProps> = ({ ficha, nome, onNavigate, temVersaoAnterior = false, onVersaoAnterior }) => {
  const { data, loading, loaded, error } = ficha;

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

  const restantes = ajustesRestantes(data);
  const versaoSlides = versaoComApresentacao(data);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto" data-testid="inicio-screen">
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
        <h2 className="font-serif text-2xl sm:text-3xl text-white">Bem-vindo, {nome}</h2>
        <p className="text-sm text-white/70 font-sans leading-relaxed">
          Os cartões abaixo mostram em que ponto o seu script está agora.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto min-h-[48px]"
          data-testid="inicio-continuar"
          onClick={() => onNavigate?.(rotaInicialDoClube(data))}
        >
          Continuar de onde parei
        </Button>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <Cartao
          testId="inicio-card-base"
          titulo={ROTULO_BASE_DO_SCRIPT}
          linhas={[linhaDosMateriais(data), linhaDaFicha(data)]}
          botao={{ rotulo: 'Abrir a base do script', testId: 'inicio-abrir-base', onClick: () => onNavigate?.('script_materiais_ficha') }}
        />
        <Cartao
          testId="inicio-card-script"
          titulo="Seu script"
          linhas={restantes === null ? [linhaDoScript(data)] : [linhaDoScript(data), linhaDosAjustes(restantes)]}
          botao={{ rotulo: 'Abrir o seu script', testId: 'inicio-abrir-script', onClick: () => onNavigate?.('script_script') }}
        />
        <Cartao
          testId="inicio-card-apresentacao"
          titulo="Apresentação"
          linhas={versaoSlides
            ? [`Apresentação pronta na versão ${versaoSlides}.`]
            : ['Apresentação ainda não gerada.', 'Ela é montada a partir de uma versão do seu script.']}
          botao={versaoSlides
            ? { rotulo: 'Abrir a apresentação', testId: 'inicio-abrir-apresentacao', onClick: () => onNavigate?.('script_script') }
            : undefined}
        />
      </div>

      {temVersaoAnterior && (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
          <Cartao
            testId="inicio-card-anterior"
            titulo="Versão anterior"
            linhas={['O que você respondeu antes continua no ar, com os insights.']}
            botao={{ rotulo: 'Abrir a versão anterior', testId: 'inicio-abrir-anterior', onClick: () => onVersaoAnterior?.() }}
          />
        </div>
      )}
    </div>
  );
};

export default InicioScreen;
