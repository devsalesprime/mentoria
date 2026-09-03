# Script 7 Passos (Ship 1): cohort, Materiais e Ficha do Script

> Branch `feat/script-7-passos`. Specs de origem (repo DYuzo): `business/campanhas/prosperus-exclusive/ferramenta-7passos/SPEC-ficha-script-v0.1.md` e `CONTRATO-prefill-json.md`.
> Escopo deste ship: (E) cohort + clube, (B) Materiais por clube, (A) Ficha do Script em modo revisão, (D) visão do cohort no admin. Geração do script (Dia 3) fica para o próximo ship.

## 1. O que muda para quem usa

| Quem | O que vê |
|--|--|
| Mentor do Exclusive (e-mail em `cohort_members` de clube ativo) | Entra pelo mesmo login. Ganha a seção **SCRIPT 7 PASSOS** no menu com **Materiais** (`/dashboard/materiais`) e **Ficha do Script** (`/dashboard/ficha`). Cai direto na Ficha depois do login (ou em Materiais, se a ficha ainda está vazia). O fluxo antigo continua intacto. |
| Sócios do mesmo clube | Veem e editam a **mesma** ficha (1 ficha por clube). **Materiais são por pessoa** (feedback do Danilo, 03/09): cada sócio vê só os arquivos, links, observações e acessos que ele mesmo enviou; um não vê o do outro. Só o admin vê tudo. |
| Mentor fora do cohort | Nada muda. Rotas `/api/script/*` respondem `403 { enabled: false }`. |
| Admin | Nova aba **Cohort** no painel: campo **Prazo dos materiais** (texto livre, aparece no "Como funciona" da tela Materiais), tabela por clube (busca, ordenação por última atividade, "n de m enviaram"), detalhe do clube com ficha (34 campos), materiais **por pessoa** (arquivos com download, links, observações, acessos de plataforma com senha mascarada e "mostrar", data do "Enviei o que tinha"), membros (adicionar/remover, ativar/desativar) e importação do JSON de pré-preenchimento. |

### 1.1 Tela Materiais (membro)

1. **Como funciona** (colapsável, aberto na primeira visita; lembra que fechou via `localStorage`): 4 passos em uma linha cada + frase do script de agendamento do time + linha **Prazo** (só se `cohort_config.prazo_materiais` estiver preenchido).
2. **5 categorias** com descritivo e exemplos (copy aprovada; chaves inalteradas): Transcrições e gravações de reuniões de venda (`script_transcricao_venda`) · Apostila, slides e material da mentoria (`script_apostila_slides`) · Proposta, roteiro e material de venda (`script_proposta_roteiro`) · CRM e planilhas (`script_crm`) · Outros (`script_outros`). Fonte: `components/script/materiais/categorias.ts`.
3. **Links** (só os da pessoa).
4. **Peça para a sua IA preencher** (03/09, tarde): 2 linhas de explicação, botão **Copiar prompt** (`navigator.clipboard` com fallback de textarea) e **Ver prompt** (colapsável, monoespaçado). O prompt é gerado no servidor por clube (`GET /api/script/prompt-ia`, ver secao 5.3): cabeçalho com o nome do mentor e do clube, o propósito (script dos 7 passos da venda da mentoria dele), os 6 blocos com a frase dos 5 M's, os 34 campos como `<chave>. <pergunta>` na ordem, e as regras de resposta (português; uma seção por campo no formato `### <chave> [CERTO|PARCIAL|INCERTO]`; `[CERTO]` = sabe por documento ou fala do mentor, `[PARCIAL]` = sabe parte ou pode estar desatualizado, `[INCERTO]` = dedução ou não sabe, então escreve "não sei"; nunca inventar número, nome ou caso; manter as palavras do mentor; terminar com `### FONTES`). Abaixo, a caixa **Cole aqui a resposta da sua IA** com **Salvar resposta**: guarda em `materials.por_pessoa[e-mail].resposta_ia = { texto, salvo_em, resumo }`; o servidor lê o formato de leve e devolve o resumo ("34 campos: 20 certos, 8 parciais, 6 incertos" ou "formato não reconhecido, salvamos mesmo assim").
5. **Acesso à sua plataforma de conteúdo (opcional)**: URL, login, senha, observações; mais de uma plataforma. Copy fixa: "Guardamos este acesso só para extrair o conteúdo das suas aulas e transformar em base de conhecimento da sua IA. Só o Danilo vê. Você pode trocar a senha depois." Senha mascarada com "mostrar".
6. **Observações** e **Enviei o que tinha** (por pessoa; o botão vira "Enviei mais coisas" depois). O clique abre a **segunda confirmação** (modal `ui/Modal`): título "Vamos começar a montar a sua ficha", texto explicando o pré-preenchimento, campo **Seu WhatsApp para o aviso (com DDD)** (opcional; 10 a 13 dígitos depois de tirar o que não é dígito; guardado com o 55 na frente se faltar), checkbox pré-marcado **Quero receber o aviso no WhatsApp**, botões **Ainda não** / **Confirmar e ir para a ficha**. Confirmar = `POST /api/script/ficha/materials/submit { notify_phone? }`: marca o submit da pessoa (como antes) **e cria 1 job na fila** (`cohort_jobs`, secao 5.2) para o worker; depois navega para `/dashboard/ficha`. Se a pessoa já tem job `queued`/`running`, o servidor devolve o existente (sem duplicar) e a tela mostra "Já estamos processando o que você enviou". `GET /api/script/ficha` traz `job` (último job da pessoa) para a tela lembrar disso ao voltar.

A tela **não** mostra mais estimativa de minutos ("10 a 30 minutos", "minutos por dia"); o card "Hoje" da Ficha mostra só o título do dia e os nomes dos blocos.

## 2. Modelo de dados (migration 015, aplicada no boot pelo `server.cjs`)

| Tabela / coluna | Uso |
|--|--|
| `cohort_clubs (slug PK, nome, ativo, created_at)` | 1 clube = 1 negócio do HubSpot. `ativo = 0` mantém o cadastro mas não libera login pelo cohort. |
| `cohort_members (email PK minúsculo, club_slug FK, nome, created_at)` | E-mails que entram sem depender da etapa do HubSpot. |
| `users.cohort` (`'exclusive'` ou NULL) e `users.club_slug` | Marcados no login (ou pelo seed/admin). As rotas leem daqui, nunca do token. |
| `script_fichas (id, club_slug UNIQUE, fields JSON, materials JSON, materials_status, materials_submitted_at, ficha_status, prefill_meta, prefilled_at, reviewed_at, last_user_activity_at, ...)` | 1 linha por clube, criada sob demanda. `materials_status`/`materials_submitted_at` do clube viram `submitted` com o **primeiro** membro que clicou (servem à visão geral do admin). |
| `cohort_config (key PK, value, updated_at)` (migration 016) | Chave/valor editável na aba Cohort. Hoje: `prazo_materiais`. A tabela é criada de forma idempotente pelos próprios routers (`utils/validation-materials.cjs`), sem mudar o `server.cjs`. |
| `cohort_jobs (id PK, tipo='prefill', club_slug, email, notify_phone, status, attempts, payload JSON, result JSON, error, created_at, started_at, finished_at, updated_at)` (migration 017) | Fila para o worker externo (a Naia, no VPS). `status` em `queued` / `running` / `done` / `error` / `needs_human`. 1 linha por "Confirmar e ir para a ficha"; 1 job ativo (`queued`/`running`) por (`tipo`, `club_slug`, `email`). Sem FK de propósito (o DDL roda pelos routers antes do schema principal). Índice `(status, created_at)`. DDL idempotente em `utils/validation-materials.cjs` (`ensureCohortJobsTable`); registro em `migrations/017_cohort_jobs.sql`. |

`materials` = `{ "por_pessoa": { "<e-mail minúsculo>": { links[], observacoes, acessos[], submitted_at, nome?, resposta_ia?, notify_phone? } }, "legado"?: { links[], observacoes } }`.
`acessos[]` = `{ plataforma_url, login, senha, observacoes }` (dado sensível: nunca vai em log nem em resposta de outro membro; só o dono, o admin e o worker da fila recebem).
`resposta_ia` = `{ texto, salvo_em, resumo }` (a resposta colada da IA do mentor; `resumo` vem de `utils/script-prompt-ia.cjs parseRespostaIA`). `notify_phone` = WhatsApp normalizado (`5511987654321`) informado na confirmação. Os dois só aparecem na resposta quando existem.
**Migração da forma antiga** (`{ links, observacoes }` por clube): `normalizeMaterials` a coloca em `legado`; só o admin vê (card "Legado" no detalhe do clube). O membro começa com a entrada dele vazia. Arquivos (`uploaded_files`) já eram por `user_id`; o que mudou é o filtro de leitura.

`fields` = `{ "1.1": { sugerido, classe, fonte, alternativas[], nota_interna, status, valor, atualizado_por, atualizado_em } }`.
Status do campo: `sugerido` | `confirmado` | `editado` | `vazio` | `aceito_vazio`. Decidido = `confirmado`, `editado` ou `aceito_vazio`.
Status da ficha: `vazia` → `pre_preenchida` (import) → `em_revisao` (primeira ação do mentor) → `confirmada` (`complete`, só com os 27 obrigatórios decididos). Editar depois de confirmada reabre (`em_revisao`).

Definição dos 34 campos: `data/script-ficha-fields.json` (fonte única; `data/script-ficha-fields.ts` tipa para o front, `utils/script-ficha.cjs` usa no servidor). Registro SQL: `migrations/015_script_ficha.sql` e `migrations/016_cohort_config.sql`.

**Atenção:** `data/` está no `.gitignore` (banco). Os arquivos `data/script-ficha-fields.json`, `data/script-ficha-fields.ts`, `data/cohort-seed.json` e `data/samples/prefill-exemplo.json` foram adicionados com `git add -f`. Mudou algum deles? `git add -f` de novo.

## 3. Seed do cohort

`data/cohort-seed.json`: 21 clubes (19 do ROSTER HubSpot de 09/08 + `ana-e-gustavo` + `marcelo-mc-participacoes`, este sem e-mail). `humanas-home-care` (churn) e `dr-peanut` (negócio em Proposta) entram com `ativo: 0`.

Roda sozinho no boot do servidor (idempotente) e à mão:

```bash
node scripts/seed-cohort.cjs                      # banco padrão (data/prosperus.db)
DB_PATH=/tmp/x.db node scripts/seed-cohort.cjs    # outro banco
```

Regras: cria clube que falta e atualiza `nome`/`ativo`; membro só é **inserido** (nunca sobrescreve membro editado pelo admin, nunca remove); marca `users.cohort/club_slug` de quem já tem conta.

## 4. Login (routes/auth.cjs)

1. Procura o e-mail (minúsculo) em `cohort_members` de clube ativo.
2. Se tem `HUBSPOT_PRIVATE_TOKEN`, consulta o HubSpot como antes (nome + etapa do negócio).
3. **Fora do cohort:** comportamento idêntico ao anterior (404 sem contato, 403 sem negócio ganho, 500 em erro).
4. **No cohort:** entra mesmo sem contato ou sem etapa ganha; erro do HubSpot é tolerado (log). Nome = HubSpot > `cohort_members.nome` > "Membro". Grava `users.cohort = 'exclusive'` e `users.club_slug`. Token ganha `cohort` e `clubSlug` (informativo).
5. E-mail é normalizado (trim + minúsculo) no schema; a conta é procurada por `lower(email)`, então `JULIO.Filho@…` e `julio.filho@…` são a mesma linha em `users` (contas antigas com caixa diferente continuam sendo encontradas).
6. `ativo = 0` no clube: sem bypass no login, `GET /api/diagnostic` devolve `cohort = null` (menu some) e `/api/script/*` responde 403 `{ enabled: false }`. Ativar/desativar pela aba Cohort re-sincroniza `users.cohort` dos membros; o seed faz o mesmo no boot.

`GET /api/diagnostic` passa a devolver `cohort`, `club_slug`, `club_nome`; o hook `useDiagnosticPersistence` expõe `cohort`, `clubSlug`, `clubNome`, `diagnosticLoaded`.

## 5. Rotas

Membro (`authMiddleware` + guarda de cohort; 403 `{ enabled: false }` sem cohort):

| Rota | Faz |
|--|--|
| `GET /api/script/ficha` | Ficha completa: `club`, `ficha_status`, `materials_status` e `materials_submitted_at` **da pessoa**, `materials` = `{ links, observacoes, acessos, submitted_at }` **só da pessoa**, `config` = `{ prazo_materiais }`, `files` (**só os da pessoa**, `mine: true`), `blocos[]` (campos com definição + estado), `hoje`, `progresso`, `dias`. Nunca devolve `legado` nem dados de outro sócio. |
| `PUT /api/script/ficha/fields` `{ updates: { "3.3": { status, valor? } } }` | Lote de decisões. `confirmado` exige sugerido; `editado` exige `valor`; `aceito_vazio` sempre; `sugerido`/`vazio` desfaz. Move a ficha para `em_revisao`. |
| `POST /api/script/ficha/complete` | `confirmada` só com os 27 obrigatórios decididos; senão 400 com `faltam[]`. |
| `PUT /api/script/ficha/materials` `{ links?, observacoes?, acessos?, resposta_ia? }` | **Parcial e por pessoa**: chave ausente mantém o que está salvo; grava em `materials.por_pessoa[<e-mail>]`. `acessos[]` = `{ plataforma_url (http/https), login?, senha?, observacoes? }`, máx. 10. `resposta_ia` = texto (máx. 200 000 chars; vazio apaga) → vira `{ texto, salvo_em, resumo }`. Responde `{ materials }` da pessoa e, quando veio `resposta_ia`, `resposta_ia: { reconhecido, campos, certos, parciais, incertos, faltam[], tem_fontes, resumo }`. O handler não loga o body. |
| `GET /api/script/prompt-ia` | `{ prompt, campos: 34 }`: o prompt "Peça para a sua IA preencher" gerado para o clube (nome do mentor = `users.name`; nomes dos sócios de `cohort_members`). Gerador: `utils/script-prompt-ia.cjs buildPromptIA`. |
| `POST /api/script/ficha/materials/submit` `{ notify_phone?, notify? }` | "Confirmar e ir para a ficha" **da pessoa** (`por_pessoa[e-mail].submitted_at`); o clube (`materials_status`/`materials_submitted_at`) vira `submitted` no primeiro. `notify_phone` opcional: 10 a 13 dígitos depois de tirar não-dígitos, 10/11 ganham `55` na frente, 12/13 precisam começar com `55`; inválido → 400. `notify: false` ignora o telefone. Grava `notify_phone` na pessoa e **enfileira 1 job `prefill`** (`utils/cohort-jobs.cjs enqueueJob`); se já existe job `queued`/`running` da pessoa, devolve esse (e atualiza o telefone). Resposta: `{ materials_status: 'submitted', materials_submitted_at, notify_phone, job: { id, tipo, status, attempts, created_at, started_at, finished_at, existing } }`. |
| `GET /api/script/materials/files` · `GET /api/script/materials/files/:id/download` | **Só os arquivos da própria pessoa** (`uploaded_files.user_id`). Arquivo de um sócio → 404. Admin baixa qualquer um por `GET /api/admin/files/:id`. |
| `POST /api/files/upload` (existente) com `category` `script_transcricao_venda` / `script_apostila_slides` / `script_proposta_roteiro` / `script_crm` / `script_outros` | Aceita PDF, Word, PowerPoint, Excel, CSV, TXT, MD, JSON e imagens. **Áudio e vídeo são recusados** (400: link do Drive ou WhatsApp). Categoria fora da lista → 400. Upload de outras categorias segue igual. |

Admin (`authMiddleware` + `adminMiddleware`):

| Rota | Faz |
|--|--|
| `GET /api/admin/cohort` | Linhas `{ club_slug, club_nome, ativo, membros[], materiais_count (arquivos de todos), links_count (links + acessos de todos), pessoas_enviaram (n de membros com submit), materials_status, ficha_status, confirmados, obrigatorios, decididos, total, ultima_atividade, ultimo_login }`. |
| `GET /api/admin/clubs/:slug/script-ficha` | Ficha com `nota_interna`/`passo`, `membros[]`, `files[]` (com `ownerEmail`/`ownerName`), **`pessoas[]`** = `{ email, nome, user_id, membro, files[], links[], observacoes, acessos[] (senha em claro; o front mascara), resposta_ia, notify_phone, submitted_at }`, `pessoas_enviaram`, `legado` (forma antiga ou `null`), `materials` (JSON normalizado), `prefill_meta`, **`jobs[]`** (até 50 jobs do clube, mais recentes primeiro). |
| `GET /api/admin/cohort/jobs?status=` · `POST /api/admin/cohort/jobs/:id/requeue` | Fila para o painel "Fila" da aba Cohort: mesma lista de `GET /api/jobs` mais `club_nome` e `pessoa_nome`, e `fila_ligada` (se `COHORT_JOBS_TOKEN` está no servidor). Requeue: volta para `queued`, zera `started_at`/`finished_at`/`error`, mantém `attempts`; job `running` → 409; inexistente → 404. |
| `GET /api/admin/cohort/config` · `PUT /api/admin/cohort/config` `{ prazo_materiais }` | Chave/valor de `cohort_config`. `prazo_materiais` (máx. 200, trim; vazio esconde a linha "Prazo" no membro). |
| `PUT /api/admin/clubs/:slug/script-ficha` | Importa o JSON do contrato. Valida: 34 chaves exatas, `classe` em Fato/DER/VZ, `fonte` e `sugerido` obrigatórios quando classe ≠ VZ, máx. 2 alternativas, `club_slug` igual à rota. Aviso (não bloqueia) se houver travessão. Nunca sobrescreve campo já decidido. `vazia` → `pre_preenchida`, grava `prefilled_at`. Clube precisa existir (404). Validação e import vivem em `utils/script-ficha.cjs` (`validatePrefillBody`, `importPrefill`) e são os mesmos de `PUT /api/jobs/:id/prefill`. |
| `PUT /api/admin/clubs/:slug/members` `{ nome?, ativo?, add: [{email, nome?}], remove: [email] }` | Cria o clube se não existe (exige `nome`), adiciona/remove e-mails, marca/desmarca `users`. |
| `GET /api/admin/files/:id?token=` (existente) | Download de qualquer arquivo. |

Validação com zod em `utils/validation.cjs` (`scriptFieldsUpdateSchema`, `scriptPrefillSchema`, `cohortMembersSchema`; `scriptMaterialsSchema` ficou sem uso) e em `utils/validation-materials.cjs` (`scriptMaterialsPessoaSchema`, `scriptMaterialsSubmitSchema`, `normalizePhone`, `scriptAcessoSchema`, `cohortConfigSchema` + `normalizeMaterials`, `memberMaterialsView`, `countSubmitted`, `readCohortConfig`, `ensureCohortJobsTable`). Rate limit continua 100 req/min em `/api` para o app (o front salva em lote com debounce de 1,5 s); `/api/jobs/*` fica fora desse limitador e tem o próprio (600 req/min: o worker baixa vários arquivos por job).

### 5.2 API da fila (`/api/jobs/*`, para o worker no VPS)

Router `routes/jobs.cjs`, montado no `server.cjs`. É a interface que a Naia programa contra; o que está aqui é o que está implementado.

**Auth:** header `Authorization: Bearer <COHORT_JOBS_TOKEN>` (variável de ambiente do app). Sem a variável no servidor, **toda** rota `/api/jobs/*` responde `503 { success: false, message: "fila desligada" }`. Token ausente ou errado → `401 { success: false, message: "Token da fila inválido." }`. Comparação em tempo constante. O token do app (JWT do membro/admin) **não** vale aqui.

**Formas comuns.** `job` = `{ id, tipo, club_slug, email, notify_phone, status, attempts, payload, result, error, created_at, started_at, finished_at, updated_at }` (`payload`/`result` já como JSON; `payload` hoje = `{ nome, submitted_at, notify }`). Erros seguem `{ success: false, message, errors? }`. Datas de `created_at`/`started_at`/`finished_at` vêm do SQLite (`YYYY-MM-DD HH:MM:SS`, UTC).

| Rota | Body / query | Resposta |
|--|--|--|
| `POST /api/jobs/next` | `{ tipo: 'prefill' }` (default `prefill`; outro valor → 400) | **200** `{ success, job, club: { slug, nome, ativo }, pessoa: { email, nome, notify_phone }, app_url }` com o job **mais antigo em `queued`** já marcado `running` (`started_at` = agora, `attempts + 1`). Claim atômico em 1 statement (`UPDATE ... WHERE id = (SELECT id ... ORDER BY created_at LIMIT 1) AND status = 'queued' RETURNING *`): 5 workers em paralelo nunca pegam o mesmo job. **204** sem body quando a fila está vazia. `app_url` = `APP_URL` do ambiente ou `protocolo://host` da requisição. |
| `GET /api/jobs?status=&tipo=&limit=` | `status` em `queued|running|done|error|needs_human` (opcional; inválido → 400); `limit` 1 a 1000 (default 200) | `{ success, data: job[] }` ordenado por `running`, `queued`, `needs_human`, `error`, `done` e depois `created_at DESC`. |
| `GET /api/jobs/phones` | | `{ success, phones: string[] }`: `notify_phone` distintos de todos os jobs (para a allowlist do WhatsApp no VPS). |
| `GET /api/jobs/:id` | | `{ success, job }`; 404 se não existe. |
| `PATCH /api/jobs/:id` | `{ status: 'done'|'error'|'needs_human'|'queued'|'running', result?, error? }` | `{ success, job }`. `done`/`error`/`needs_human` gravam `finished_at`; `queued` limpa `started_at`/`finished_at` (devolver à fila); `running` mantém `started_at`. `result` vira JSON; `error` até 4000 chars (`null` limpa). Status fora da lista → 400. |
| `GET /api/jobs/:id/materials` | | `{ success, job_id, club: { slug, nome, ativo }, pessoas: [{ email, nome, membro, files: [{ id, name, type, size, category, created_at, download_url }], links: [{ url, rotulo, tipo }], observacoes, acessos: [{ plataforma_url, login, senha, observacoes }], resposta_ia: { texto, salvo_em, resumo } | null, notify_phone, submitted_at }], legado: { links, observacoes } | null, materials_status, materials_submitted_at }`. **Todos os materiais do CLUBE do job**, agrupados por pessoa (inclui quem não clicou em confirmar e ex-membro que enviou arquivo). `acessos` vem com a senha em claro: o worker precisa para extrair a plataforma; **nunca logar**. `download_url` é relativo (`/api/jobs/<id>/files/<fileId>`): prefixe com a base do app e mande o mesmo Bearer. |
| `GET /api/jobs/:id/files/:fileId` | | Stream do arquivo (`Content-Disposition: attachment`, `Content-Type` do upload). 404 se o arquivo não é do clube do job, não é categoria `script_*` ou sumiu do disco. |
| `GET /api/jobs/:id/ficha` | | `{ success, job_id, club, ficha_status, prefill_meta, prefilled_at, reviewed_at, last_user_activity_at, decididos: string[], blocos: [...], progresso, hoje, dias }`. `blocos[].campos[]` é a mesma forma da ficha do admin (definição + estado: `status`, `decidido`, `sugerido`, `valor`, `valor_efetivo`, `classe`, `fonte`, `alternativas`, `nota_interna`, `passo`, `fontes_precedencia`). `decididos` = chaves com `confirmado`/`editado`/`aceito_vazio` (o worker não precisa gerar para elas; se gerar, o servidor ignora). |
| `PUT /api/jobs/:id/prefill` | JSON do contrato `CONTRATO-prefill-json.md` (`{ club_slug?, club_nome?, membros?, gerado_em?, gerado_por?, fontes_lidas?, campos: { "1.1": { sugerido, classe, fonte, alternativas?, nota_interna? }, ... } }`) | Mesma validação e semântica de `PUT /api/admin/clubs/:slug/script-ficha`, com o clube vindo do job: 34 chaves exatas; `classe` em `Fato`/`DER`/`VZ`; `fonte` e `sugerido` obrigatórios fora de `VZ`; `VZ` → campo `vazio`; máx. 2 alternativas; `club_slug`, se vier, tem que ser o do job; travessão só avisa. **Nunca sobrescreve** campo `confirmado`/`editado`/`aceito_vazio` (vai em `skipped`). `vazia` → `pre_preenchida`; grava `prefilled_at` e `prefill_meta` (com `job_id`). **200** `{ success, message, imported: n, skipped: string[], warnings: string[], ficha_status, resumo: { total, decididos, obrigatorios, obrigatorios_decididos, sugeridos, vazios } }`; **400** `{ message: "JSON fora do contrato.", errors[], warnings[] }` (ou `"Dados inválidos"` do zod); 404 se o clube sumiu. Não mexe no status do job: feche com o `PATCH`. |

Fluxo esperado do worker: `POST next` → (204 = dormir) → `GET :id/materials` + `GET :id/ficha` (+ `GET :id/files/:fileId` de cada arquivo) → gerar o JSON → `PUT :id/prefill` → `PATCH :id { status: 'done', result: <resumo do PUT> }` (ou `error` / `needs_human` com `error`) → avisar `pessoa.notify_phone` se houver. Se o worker morrer no meio, o job fica `running`: o admin usa "Reprocessar" (ou o worker faz `PATCH { status: 'queued' }`).

Helpers: `utils/cohort-jobs.cjs` (`enqueueJob`, `claimNextJob`, `updateJobStatus`, `requeueJob`, `listJobs`, `listPhones`, `findLatestJob`) e `utils/cohort-materials.cjs` (membros, arquivos e `buildPessoas` do clube, compartilhados com o admin).

## 6. Front

| Arquivo | Papel |
|--|--|
| `hooks/useScriptFicha.ts` | Uma instância no `Dashboard`, compartilhada por Materiais e Ficha. Decisão otimista local + fila com debounce 1,5 s → `PUT fields`. Indicador `saveState` (Salvando / Salvo / erro com retry na próxima alteração). Fila pendente é despachada com `fetch keepalive` em `pagehide`/`beforeunload`, no logout e no unmount. Materiais: `saveMaterials(patch)` manda só as chaves alteradas (`links`, `observacoes`, `acessos` e/ou `resposta_ia` como texto) e devolve `true/false`; `submitMaterials({ notify_phone?, notify? })` devolve `{ ok, existing, job, message }`; tipos `MaterialAcesso`, `MaterialRespostaIA`, `ScriptMaterials { links, observacoes, acessos, submitted_at, resposta_ia?, notify_phone? }`, `ScriptJobInfo`, `ScriptConfig`; `data.job` = último job da pessoa. A parte de campos (`decide/flush/complete`) não mudou. |
| `components/script/materiais/categorias.ts` | Copy das 5 categorias (label, descritivo, ícone; "Outros" cita podcasts, entrevistas, reportagens, posts de blog), passos do "Como funciona", frase, `LINKS_DICA` (site, página de vendas, Instagram, podcasts, entrevistas, reportagens, blog, aulas públicas), `PROMPT_IA_INTRO` e aviso do acesso à plataforma. `MATERIAL_CATEGORIA_LABEL` também é usado no admin. |
| `components/script/materiais/PromptIA.tsx` | Seção "Peça para a sua IA preencher": busca `GET /api/script/prompt-ia`, **Copiar prompt** (`copyText`: clipboard com fallback), **Ver prompt** (textarea só leitura), caixa "Cole aqui a resposta da sua IA" + **Salvar resposta** (→ `saveMaterials({ resposta_ia })`), mostra o resumo e a data. |
| `components/script/materiais/ConfirmarEnvioModal.tsx` | Segunda confirmação (`ui/Modal`): texto, WhatsApp (validação local igual à do servidor, `phoneError`), checkbox "Quero receber o aviso no WhatsApp", **Ainda não** / **Confirmar e ir para a ficha**. Job já existente → "Já estamos processando o que você enviou" + "Ir para a ficha". Botões e campos com 44 px. |
| `components/script/materiais/ComoFunciona.tsx` | Bloco colapsável (aberto na 1ª visita; `localStorage` guarda que fechou). Recebe `prazo`. |
| `components/script/materiais/AcessosPlataforma.tsx` | Seção de acessos: lista com senha mascarada + "mostrar", formulário (URL, login, senha, observações), remover. Exporta `maskSenha`. |
| `components/script/FichaScreen.tsx` | Card "Hoje: <título do dia>" + linha "Dia N de 3 · 1. Meta · 2. Mentor · 3. Mentorado · x de y obrigatórios decididos" (sem minutos; Dia 1 = blocos 1 a 3, Dia 2 = 4 a 6, Dia 3 = revisar o script, "em breve"), 6 blocos em acordeão com "x de y", celebração discreta ao fechar bloco, botão "Fechar ficha". |
| `components/script/FichaField.tsx` | Pergunta, sugerido, "Fonte: …", até 2 "Também encontramos", Confirmar / Editar (editor por tipo), "Não encontramos, você preenche", "Não se aplica / deixar vazio" (opcional) e "Deixar em branco por enquanto" (obrigatório). |
| `components/script/MateriaisScreen.tsx` | Cabeçalho (copy: "O que você envia aqui só você e o Danilo veem."), `ComoFunciona`, 5 categorias com descritivo + `FileUpload` (props `accept`, `allowedMimePrefixes`, `allowedExtensions`, `hint`), aviso de áudio/vídeo, links, `PromptIA`, `AcessosPlataforma`, observações, "Enviei o que tinha" → `ConfirmarEnvioModal` (por pessoa; o menu do Dashboard usa o mesmo `materials_status`). Com job `queued`/`running` mostra "Já estamos processando o que você enviou"; `done` mostra que a ficha está pronta para revisar. |
| `components/Dashboard.tsx` | Slugs `materiais`/`ficha`, seção do menu só com cohort, redirect pós-login, `renderContent`. |
| `components/admin/CohortOverview.tsx` + `CohortClubDetail.tsx`, `components/AdminPanel.tsx` | Aba Cohort: campo "Prazo dos materiais" (salva em `cohort_config`), painel **Fila de pré-preenchimento** (`CohortJobsPanel`: tabela pessoa / clube / status / tentativas / criado / erro, botão **Reprocessar** = `POST /api/admin/cohort/jobs/:id/requeue`, aviso quando a fila está desligada no servidor), coluna Materiais com "n de m enviaram"; detalhe com card por pessoa (arquivos com download, links, acessos com senha mascarada + "mostrar", **WhatsApp para o aviso**, **Resposta da IA** colapsável em monoespaçado com resumo e **Baixar .md**, observações, data do submit), card "Legado" quando existe e a lista de jobs do clube. |

Copy: pt-BR com acentos, sem travessão, sem "diagnóstico" na área nova. Tokens Prosperus (navy panel, dourado, EB Garamond nos títulos, Manrope no corpo). Layout pensado para celular.

## 7. Testes e verificação local

```bash
npm test                     # vitest: inclui tests/utils/scriptFields.test.ts, tests/components/FichaField.test.tsx,
                             #   tests/utils/validationMaterials.test.ts (schemas + normalizeMaterials),
                             #   tests/routes/scriptMaterials.test.ts (routers reais em sqlite :memory:, ambiente node:
                             #   arquivos só do dono, 404 para o sócio, acessos não vazam, submit por pessoa, legado, cohort_config),
                             #   tests/utils/scriptPromptIa.test.ts (34 campos na ordem, 6 blocos com os 5 M's, tags explicadas,
                             #   FONTES no fim, sem travessão; parseRespostaIA e o resumo),
                             #   tests/utils/cohortJobs.test.ts (normalizePhone; sqlite em ARQUIVO temporário: 1 job ativo por pessoa,
                             #   claim atômico com 5 conexões em paralelo, done/error/requeue, phones) e
                             #   tests/routes/jobsRoutes.test.ts (prompt-ia, resposta_ia, submit com telefone e job, jobsAuth 503/401,
                             #   next/materials/files/ficha/prefill sem sobrescrever decididos/patch/phones, admin list + requeue)
npm run build                # vite build
npx tsc --noEmit             # 4 erros pré-existentes em ActionPlanModule.tsx e useUserPersistence.ts (não são deste ship)
```

E2E de API em banco temporário (nunca o de produção). `COHORT_JOBS_TOKEN` tem que estar nos dois processos, com o mesmo valor (o e2e se recusa a rodar sem ele):

```bash
# terminal 1: servidor com banco descartável (DB_PATH só existe para isso; produção ignora)
COHORT_JOBS_TOKEN=e2e-token DB_PATH=/tmp/e2e.db PORT=3999 NODE_ENV=development node server.cjs

# terminal 2
curl -s http://localhost:3999/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3999/api/script/ficha     # 401
COHORT_JOBS_TOKEN=e2e-token node scripts/e2e-script-ficha.cjs --base=http://localhost:3999
```

O `e2e-script-ficha.cjs` cunha o token admin com o `JWT_SECRET` do `.env` (mesmo padrão de `scripts/deliver.cjs`), cria o clube `exemplo-clube`, faz o login do membro A pelo cohort, importa `data/samples/prefill-exemplo.json` (fictício; recusa um JSON inválido antes), confirma/edita/aceita vazio, tenta fechar cedo (400), fecha a ficha, reimporta (34 mantidos) e então cobre os materiais por pessoa: A salva links; admin adiciona o sócio B; A sobe um `.txt` por multipart (categoria inválida → 400); B não lista nem baixa o arquivo (404) e A baixa; A salva um acesso de plataforma (URL sem http → 400) e a resposta de B não contém a senha nem a URL; B clica "Enviei o que tinha" (B `submitted`, A `pending`, clube `submitted`, `pessoas_enviaram = 1`), depois A; admin grava e limpa `prazo_materiais` (membro lê; membro não grava → 403). Depois a fila (passos 12f a 12n): A lê o prompt da IA (34 campos, `### FONTES`, sem travessão, cita o nome) e cola uma resposta (resumo "3 campos: 1 certo, 1 parcial, 1 incerto"; B não vê); telefone inválido → 400; A confirma com WhatsApp e recebe o job que já existia (`existing: true`, telefone normalizado com 55) e `GET ficha` traz `job`; worker sem token / token errado → 401, token de membro → 401; `POST /api/jobs/next` pega B (mais antigo), depois A (com telefone e nome), depois 204; `materials` do job traz o arquivo de A com `download_url`, o acesso com senha, a resposta da IA e o submit de B; o worker baixa o arquivo (404 para inexistente); `GET ficha` do job mostra os 34 decididos; `PUT prefill` com `club_slug` errado → 400 e com o JSON de amostra → 0 importados, 34 mantidos; `PATCH done` (A) e `needs_human` (B); lista por status; `phones`; admin lista a fila (`fila_ligada: true`, clube e telefone) e membro → 403; `Reprocessar` B → worker pega de novo (tentativa 2), requeue de job `running` → 409; detalhe do clube traz jobs, telefone e resposta da IA; depois de `done`, A confirma de novo e nasce job novo (worker fecha; fila termina vazia). Por fim: detalhe admin mostra A com arquivo, link e acesso (com senha) e B só com o submit; admin baixa o arquivo; A apaga o próprio arquivo (limpeza); visão admin; 403 de um usuário fora do cohort; desativar/reativar do clube. Ele se recusa a rodar fora de localhost.

## 8. Deploy (VPS, PM2 `prosperus`)

**Variável nova: `COHORT_JOBS_TOKEN`** (ver `.env.example`). Sem ela o app sobe normalmente, mas `/api/jobs/*` responde 503 e o painel "Fila" avisa "fila desligada no servidor". Gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e colocar o mesmo valor no worker da Naia. `APP_URL` é opcional (só muda o `app_url` devolvido ao worker). `DB_PATH` é opcional e só para testes locais.

```bash
ssh <vps>
cd /var/www/prosperus-mentor-diagnosis
cp data/prosperus.db data/prosperus-backup-$(date +%s).db      # 1. backup do banco
git pull                                                        # 2. código (depois do merge em main)
npm install                                                     # 3. dependências (não há nova)
# 3b. .env: COHORT_JOBS_TOKEN=<token> (e APP_URL=https://<dominio>, opcional)
npm run build                                                   # 4. front
pm2 restart prosperus                                           # 5. o boot aplica a migration 015 e o seed do cohort; os routers criam cohort_config (016) e cohort_jobs (017)
pm2 logs prosperus --lines 30 | grep -E "Schema v2.2|Cohort seed|Fila /api/jobs"
curl -s https://<dominio>/api/script/ficha -o /dev/null -w "%{http_code}\n"   # 401 esperado sem token
curl -s https://<dominio>/api/jobs/phones -o /dev/null -w "%{http_code}\n"    # 401 com a fila ligada; 503 sem COHORT_JOBS_TOKEN
```

Conferir depois: aba **Cohort** no `/admin` lista 21 clubes; um e-mail do roster entra e vê "SCRIPT 7 PASSOS" no menu; o painel "Fila" não mostra o aviso de fila desligada.

## 9. Fora deste ship / incertezas

- Geração do script (Dia 3), versões v1/v2 e "Script aprovado" (SPEC secao 5): não implementados; o card mostra "em breve".
- `ativo = 0` para `humanas-home-care` e `dr-peanut` vem do ROSTER (churn / Proposta); rever com o Caio.
- `marcelo-mc-participacoes` está sem e-mail; ninguém entra por ele até o admin adicionar.
- O seed não remove membro nem desfaz edição do admin; para mover alguém de clube, use a aba Cohort (ou edite o seed e apague o membro antes).
- Login do cohort com e-mail em caixa diferente da conta antiga cria conta nova (comportamento antigo mantido); a ficha é por clube, então não perde nada.
- Materiais por pessoa: links/observações salvos antes de 03/09 (forma por clube) ficam em `legado`, visíveis só ao admin; ninguém os "herda". Arquivos já eram por `user_id`, então cada um continua vendo os seus.
- `acessos` guarda a senha em claro no JSON do banco (o banco vive fora do git e o dono já pode trocar a senha depois); não há criptografia em repouso neste ship. A senha nunca vai a log nem a resposta de outro membro (o worker da fila recebe, porque precisa extrair a plataforma).
- O aviso no WhatsApp **não** é disparado pelo app: o app só guarda `notify_phone` no job e expõe `GET /api/jobs/phones`; quem avisa é o worker no VPS depois do `PATCH done`.
- Job preso em `running` (worker morreu) não volta sozinho: o admin usa "Reprocessar" só depois que o worker marcar `error`/`needs_human`, ou o worker faz `PATCH { status: 'queued' }`. Sem timeout automático neste ship.
- A leitura da resposta da IA é só de formato (conta `### <chave> [TAG]`); o conteúdo é lido pelo worker, que recebe `resposta_ia` em `GET /api/jobs/:id/materials`.
