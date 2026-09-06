/**
 * Escrita concorrente de sócios (6 clubes têm dois donos na mesma ficha).
 *
 * A ficha é do clube: os dois sócios veem e editam as mesmas perguntas. Até aqui a última gravação vencia
 * em silêncio e um apagava o que o outro tinha decidido. Agora cada campo carrega uma versão; quando o
 * sócio responde primeiro, o servidor recusa a gravação (409) e a tela mostra este aviso, que não bloqueia
 * nada: a pessoa escolhe ficar com a resposta dele ou gravar a dela por cima.
 *
 * Duas peças:
 *   AvisoSocio    o aviso com as duas saídas ("Manter a resposta dele" / "Usar a minha");
 *   RespondidoPor a linha discreta "respondido por Fulano há 5 minutos" em campo que o sócio decidiu.
 */
import React from 'react';
import type { ScriptAutorCampo, ScriptFieldView } from '../../data/script-ficha-fields';
import type { FieldConflito } from '../../hooks/useScriptFicha';
import { Button } from '../ui/Button';

/** Primeiro nome (o aviso chama a pessoa pelo nome); sem nome, o e-mail antes do arroba. */
export function primeiroNome(autor: ScriptAutorCampo | null | undefined): string {
  if (!autor) return '';
  const nome = String(autor.nome || '').trim();
  if (nome) return nome.split(/\s+/)[0];
  const email = String(autor.email || '').trim();
  return email ? email.split('@')[0] : '';
}

/** "agora", "há 5 minutos", "há 2 horas", "há 3 dias". Data do servidor (UTC) ou ISO. */
export function haQuantoTempo(quando: string | null | undefined, agora: number = Date.now()): string {
  if (!quando) return '';
  const texto = String(quando);
  const ms = Date.parse(/T|Z|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto.replace(' ', 'T')}Z`);
  if (Number.isNaN(ms)) return '';
  const seg = Math.max(0, Math.round((agora - ms) / 1000));
  if (seg < 60) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return min === 1 ? 'há 1 minuto' : `há ${min} minutos`;
  const horas = Math.round(min / 60);
  if (horas < 24) return horas === 1 ? 'há 1 hora' : `há ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** O sócio decidiu este campo? (o campo é do clube, então o autor pode ser o outro dono) */
export function respondidoPeloSocio(campo: Pick<ScriptFieldView, 'decidido' | 'decidido_por'>, meuEmail: string): boolean {
  const autor = campo.decidido_por;
  if (!campo.decidido || !autor || !autor.email) return false;
  return autor.email.trim().toLowerCase() !== String(meuEmail || '').trim().toLowerCase();
}

/** Texto do aviso, com nome quando o clube tem o nome da pessoa. */
export function textoDoAviso(autor: ScriptAutorCampo | null | undefined): string {
  const nome = primeiroNome(autor);
  return nome
    ? `O seu sócio ${nome} acabou de responder este campo:`
    : 'O seu sócio acabou de responder este campo:';
}

export const COPY_MANTER = 'Manter a resposta dele';
export const COPY_USAR_MINHA = 'Usar a minha';

interface AvisoSocioProps {
  conflito: FieldConflito;
  onManter: () => void;
  onUsarMinha: () => void;
}

/** Aviso que não bloqueia: a resposta do sócio já está no campo; os dois botões decidem qual fica. */
export const AvisoSocio: React.FC<AvisoSocioProps> = ({ conflito, onManter, onUsarMinha }) => {
  const valor = String(conflito.valor_efetivo || conflito.valor || '').trim();
  return (
    <div
      className="rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/[0.07] p-3 space-y-2"
      role="status"
      data-testid={`aviso-socio-${conflito.field_key}`}
    >
      <p className="text-sm text-white/85 font-sans">
        {textoDoAviso(conflito.decidido_por)}
        {valor ? <span className="block text-white/70 italic mt-1 whitespace-pre-line">{valor}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="md" className="min-h-[44px] sm:min-h-0" onClick={onManter}>{COPY_MANTER}</Button>
        <Button variant="ghost" size="md" className="min-h-[44px] sm:min-h-0" onClick={onUsarMinha}>{COPY_USAR_MINHA}</Button>
      </div>
    </div>
  );
};

/** "respondido por Fulano há 5 minutos": só quando quem respondeu foi o sócio, nunca você. */
export const RespondidoPor: React.FC<{ campo: ScriptFieldView; meuEmail: string }> = ({ campo, meuEmail }) => {
  if (!respondidoPeloSocio(campo, meuEmail)) return null;
  const nome = primeiroNome(campo.decidido_por);
  const quando = haQuantoTempo(campo.atualizado_em);
  return (
    <span className="text-[11px] text-white/50 font-sans" data-testid={`respondido-por-${campo.key}`}>
      respondido por {nome}{quando ? ` ${quando}` : ''}
    </span>
  );
};
