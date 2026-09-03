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
4. **Acesso à sua plataforma de conteúdo (opcional)**: URL, login, senha, observações; mais de uma plataforma. Copy fixa: "Guardamos este acesso só para extrair o conteúdo das suas aulas e transformar em base de conhecimento da sua IA. Só o Danilo vê. Você pode trocar a senha depois." Senha mascarada com "mostrar".
5. **Observações** e **Enviei o que tinha** (por pessoa; o botão vira "Enviei mais coisas" depois).

## 2. Modelo de dados (migration 015, aplicada no boot pelo `server.cjs`)

| Tabela / coluna | Uso |
|--|--|
| `cohort_clubs (slug PK, nome, ativo, created_at)` | 1 clube = 1 negócio do HubSpot. `ativo = 0` mantém o cadastro mas não libera login pelo cohort. |
| `cohort_members (email PK minúsculo, club_slug FK, nome, created_at)` | E-mails que entram sem depender da etapa do HubSpot. |
| `users.cohort` (`'exclusive'` ou NULL) e `users.club_slug` | Marcados no login (ou pelo seed/admin). As rotas leem daqui, nunca do token. |
| `script_fichas (id, club_slug UNIQUE, fields JSON, materials JSON, materials_status, materials_submitted_at, ficha_status, prefill_meta, prefilled_at, reviewed_at, last_user_activity_at, ...)` | 1 linha por clube, criada sob demanda. `materials_status`/`materials_submitted_at` do clube viram `submitted` com o **primeiro** membro que clicou (servem à visão geral do admin). |
| `cohort_config (key PK, value, updated_at)` (migration 016) | Chave/valor editável na aba Cohort. Hoje: `prazo_materiais`. A tabela é criada de forma idempotente pelos próprios routers (`utils/validation-materials.cjs`), sem mudar o `server.cjs`. |

`materials` = `{ "por_pessoa": { "<e-mail minúsculo>": { links[], observacoes, acessos[], submitted_at, nome? } }, "legado"?: { links[], observacoes } }`.
`acessos[]` = `{ plataforma_url, login, senha, observacoes }` (dado sensível: nunca vai em log nem em resposta de outro membro; só o dono e o admin recebem).
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
| `PUT /api/script/ficha/materials` `{ links?, observacoes?, acessos? }` | **Parcial e por pessoa**: chave ausente mantém o que está salvo; grava em `materials.por_pessoa[<e-mail>]`. `acessos[]` = `{ plataforma_url (http/https), login?, senha?, observacoes? }`, máx. 10. Responde `{ materials }` da pessoa. O handler não loga o body. |
| `POST /api/script/ficha/materials/submit` | "Enviei o que tinha" **da pessoa** (`por_pessoa[e-mail].submitted_at`); o clube (`materials_status`/`materials_submitted_at`) vira `submitted` no primeiro. |
| `GET /api/script/materials/files` · `GET /api/script/materials/files/:id/download` | **Só os arquivos da própria pessoa** (`uploaded_files.user_id`). Arquivo de um sócio → 404. Admin baixa qualquer um por `GET /api/admin/files/:id`. |
| `POST /api/files/upload` (existente) com `category` `script_transcricao_venda` / `script_apostila_slides` / `script_proposta_roteiro` / `script_crm` / `script_outros` | Aceita PDF, Word, PowerPoint, Excel, CSV, TXT, MD, JSON e imagens. **Áudio e vídeo são recusados** (400: link do Drive ou WhatsApp). Categoria fora da lista → 400. Upload de outras categorias segue igual. |

Admin (`authMiddleware` + `adminMiddleware`):

| Rota | Faz |
|--|--|
| `GET /api/admin/cohort` | Linhas `{ club_slug, club_nome, ativo, membros[], materiais_count (arquivos de todos), links_count (links + acessos de todos), pessoas_enviaram (n de membros com submit), materials_status, ficha_status, confirmados, obrigatorios, decididos, total, ultima_atividade, ultimo_login }`. |
| `GET /api/admin/clubs/:slug/script-ficha` | Ficha com `nota_interna`/`passo`, `membros[]`, `files[]` (com `ownerEmail`/`ownerName`), **`pessoas[]`** = `{ email, nome, user_id, membro, files[], links[], observacoes, acessos[] (senha em claro; o front mascara), submitted_at }`, `pessoas_enviaram`, `legado` (forma antiga ou `null`), `materials` (JSON normalizado), `prefill_meta`. |
| `GET /api/admin/cohort/config` · `PUT /api/admin/cohort/config` `{ prazo_materiais }` | Chave/valor de `cohort_config`. `prazo_materiais` (máx. 200, trim; vazio esconde a linha "Prazo" no membro). |
| `PUT /api/admin/clubs/:slug/script-ficha` | Importa o JSON do contrato. Valida: 34 chaves exatas, `classe` em Fato/DER/VZ, `fonte` e `sugerido` obrigatórios quando classe ≠ VZ, máx. 2 alternativas, `club_slug` igual à rota. Aviso (não bloqueia) se houver travessão. Nunca sobrescreve campo já decidido. `vazia` → `pre_preenchida`, grava `prefilled_at`. Clube precisa existir (404). |
| `PUT /api/admin/clubs/:slug/members` `{ nome?, ativo?, add: [{email, nome?}], remove: [email] }` | Cria o clube se não existe (exige `nome`), adiciona/remove e-mails, marca/desmarca `users`. |
| `GET /api/admin/files/:id?token=` (existente) | Download de qualquer arquivo. |

Validação com zod em `utils/validation.cjs` (`scriptFieldsUpdateSchema`, `scriptPrefillSchema`, `cohortMembersSchema`; `scriptMaterialsSchema` ficou sem uso) e em `utils/validation-materials.cjs` (`scriptMaterialsPessoaSchema`, `scriptAcessoSchema`, `cohortConfigSchema` + `normalizeMaterials`, `memberMaterialsView`, `countSubmitted`, `readCohortConfig`). Rate limit continua 100 req/min em `/api`: o front salva em lote com debounce de 1,5 s.

## 6. Front

| Arquivo | Papel |
|--|--|
| `hooks/useScriptFicha.ts` | Uma instância no `Dashboard`, compartilhada por Materiais e Ficha. Decisão otimista local + fila com debounce 1,5 s → `PUT fields`. Indicador `saveState` (Salvando / Salvo / erro com retry na próxima alteração). Fila pendente é despachada com `fetch keepalive` em `pagehide`/`beforeunload`, no logout e no unmount. Materiais: `saveMaterials(patch)` manda só as chaves alteradas (`links`, `observacoes` e/ou `acessos`) e devolve `true/false`; tipos `MaterialAcesso`, `ScriptMaterials { links, observacoes, acessos, submitted_at }`, `ScriptConfig`. A parte de campos (`decide/flush/complete`) não mudou. |
| `components/script/materiais/categorias.ts` | Copy das 5 categorias (label, descritivo, ícone), passos do "Como funciona", frase e aviso do acesso à plataforma. `MATERIAL_CATEGORIA_LABEL` também é usado no admin. |
| `components/script/materiais/ComoFunciona.tsx` | Bloco colapsável (aberto na 1ª visita; `localStorage` guarda que fechou). Recebe `prazo`. |
| `components/script/materiais/AcessosPlataforma.tsx` | Seção de acessos: lista com senha mascarada + "mostrar", formulário (URL, login, senha, observações), remover. Exporta `maskSenha`. |
| `components/script/FichaScreen.tsx` | Card "Hoje: <blocos> · ≈ N min" (Dia 1 = blocos 1 a 3, Dia 2 = 4 a 6, Dia 3 = revisar o script, "em breve"), 6 blocos em acordeão com "x de y", celebração discreta ao fechar bloco, botão "Fechar ficha". |
| `components/script/FichaField.tsx` | Pergunta, sugerido, "Fonte: …", até 2 "Também encontramos", Confirmar / Editar (editor por tipo), "Não encontramos, você preenche", "Não se aplica / deixar vazio" (opcional) e "Deixar em branco por enquanto" (obrigatório). |
| `components/script/MateriaisScreen.tsx` | Cabeçalho (copy: "só você e o Danilo veem: cada sócio manda o seu"), `ComoFunciona`, 5 categorias com descritivo + `FileUpload` (props `accept`, `allowedMimePrefixes`, `allowedExtensions`, `hint`), aviso de áudio/vídeo, links, `AcessosPlataforma`, observações, "Enviei o que tinha" (por pessoa; o menu do Dashboard usa o mesmo `materials_status`). |
| `components/Dashboard.tsx` | Slugs `materiais`/`ficha`, seção do menu só com cohort, redirect pós-login, `renderContent`. |
| `components/admin/CohortOverview.tsx` + `CohortClubDetail.tsx`, `components/AdminPanel.tsx` | Aba Cohort: campo "Prazo dos materiais" (salva em `cohort_config`), coluna Materiais com "n de m enviaram"; detalhe com card por pessoa (arquivos com download, links, acessos com senha mascarada + "mostrar", observações, data do submit) e card "Legado" quando existe. |

Copy: pt-BR com acentos, sem travessão, sem "diagnóstico" na área nova. Tokens Prosperus (navy panel, dourado, EB Garamond nos títulos, Manrope no corpo). Layout pensado para celular.

## 7. Testes e verificação local

```bash
npm test                     # vitest: inclui tests/utils/scriptFields.test.ts, tests/components/FichaField.test.tsx,
                             #   tests/utils/validationMaterials.test.ts (schemas + normalizeMaterials) e
                             #   tests/routes/scriptMaterials.test.ts (routers reais em sqlite :memory:, ambiente node:
                             #   arquivos só do dono, 404 para o sócio, acessos não vazam, submit por pessoa, legado, cohort_config)
npm run build                # vite build
npx tsc --noEmit             # 4 erros pré-existentes em ActionPlanModule.tsx e useUserPersistence.ts (não são deste ship)
```

E2E de API em banco temporário (nunca o de produção):

```bash
# terminal 1: servidor com banco descartável (DB_PATH só existe para isso; produção ignora)
DB_PATH=/tmp/e2e.db PORT=3999 NODE_ENV=development node server.cjs

# terminal 2
curl -s http://localhost:3999/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3999/api/script/ficha     # 401
node scripts/e2e-script-ficha.cjs --base=http://localhost:3999
```

O `e2e-script-ficha.cjs` cunha o token admin com o `JWT_SECRET` do `.env` (mesmo padrão de `scripts/deliver.cjs`), cria o clube `exemplo-clube`, faz o login do membro A pelo cohort, importa `data/samples/prefill-exemplo.json` (fictício; recusa um JSON inválido antes), confirma/edita/aceita vazio, tenta fechar cedo (400), fecha a ficha, reimporta (34 mantidos) e então cobre os materiais por pessoa: A salva links; admin adiciona o sócio B; A sobe um `.txt` por multipart (categoria inválida → 400); B não lista nem baixa o arquivo (404) e A baixa; A salva um acesso de plataforma (URL sem http → 400) e a resposta de B não contém a senha nem a URL; B clica "Enviei o que tinha" (B `submitted`, A `pending`, clube `submitted`, `pessoas_enviaram = 1`), depois A; admin grava e limpa `prazo_materiais` (membro lê; membro não grava → 403); detalhe admin mostra A com arquivo, link e acesso (com senha) e B só com o submit; admin baixa o arquivo; A apaga o próprio arquivo (limpeza). Por fim, lê a visão admin, confirma o 403 de um usuário fora do cohort e o desativar/reativar do clube. Ele se recusa a rodar fora de localhost.

## 8. Deploy (VPS, PM2 `prosperus`)

Sem variável de ambiente nova. `DB_PATH` é opcional e só para testes locais.

```bash
ssh <vps>
cd /var/www/prosperus-mentor-diagnosis
cp data/prosperus.db data/prosperus-backup-$(date +%s).db      # 1. backup do banco
git pull                                                        # 2. código (depois do merge em main)
npm install                                                     # 3. dependências (não há nova)
npm run build                                                   # 4. front
pm2 restart prosperus                                           # 5. o boot aplica a migration 015 e o seed do cohort; os routers criam cohort_config (016)
pm2 logs prosperus --lines 30 | grep -E "Schema v2.2|Cohort seed"
curl -s https://<dominio>/api/script/ficha -o /dev/null -w "%{http_code}\n"   # 401 esperado sem token
```

Conferir depois: aba **Cohort** no `/admin` lista 21 clubes; um e-mail do roster entra e vê "SCRIPT 7 PASSOS" no menu.

## 9. Fora deste ship / incertezas

- Geração do script (Dia 3), versões v1/v2 e "Script aprovado" (SPEC secao 5): não implementados; o card mostra "em breve".
- `ativo = 0` para `humanas-home-care` e `dr-peanut` vem do ROSTER (churn / Proposta); rever com o Caio.
- `marcelo-mc-participacoes` está sem e-mail; ninguém entra por ele até o admin adicionar.
- O seed não remove membro nem desfaz edição do admin; para mover alguém de clube, use a aba Cohort (ou edite o seed e apague o membro antes).
- Login do cohort com e-mail em caixa diferente da conta antiga cria conta nova (comportamento antigo mantido); a ficha é por clube, então não perde nada.
- Materiais por pessoa: links/observações salvos antes de 03/09 (forma por clube) ficam em `legado`, visíveis só ao admin; ninguém os "herda". Arquivos já eram por `user_id`, então cada um continua vendo os seus.
- `acessos` guarda a senha em claro no JSON do banco (o banco vive fora do git e o dono já pode trocar a senha depois); não há criptografia em repouso neste ship. A senha nunca vai a log nem a resposta de outro membro.
