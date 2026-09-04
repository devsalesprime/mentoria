# Copy do mentorando: auditoria de 04/09/2026

Regra do dono (04/09): "ajusta a linguagem para ser simples e clara, evidenciando o valor".
Público: empresário dono de mentoria, no celular, sem repertório técnico.
Escopo: telas Materiais, Ficha do Script, Seu script (copy de topo, grifos), textos de ajuda dos campos (`ajuda` do JSON). Telas de admin não entram. `Dashboard.tsx` não foi alterado (menu já estava limpo: Materiais, Ficha do Script, Seu script).

## As 10 regras aplicadas

| # | Regra | Como apareceu |
|--|--|--|
| 1 | Frase curta com verbo; uma ideia por frase | "Revise... Confirme, edite ou preencha. Cada resposta mostra de onde veio." |
| 2 | Dizer o que a pessoa ganha, não como o sistema funciona | "Quanto mais real, mais o script sai na sua voz." |
| 3 | Segunda pessoa direta | "Você recebe para ler e ajustar." |
| 4 | Zero jargão (job, cohort, worker, prefill, gate, versão N como id, MCP, runner, Naia) | "monta o script v1" virou "escreve a primeira versão do seu script"; "parte da v1" virou "parte desta" |
| 5 | IA nunca como sujeito misterioso; preferir "a gente" ou "nós" | "A IA vai revisar este campo" virou "Vamos refazer a sugestão deste campo"; "Em revisão pela IA" virou "Nova sugestão a caminho". "Sua IA" ficou só onde é a ferramenta da própria pessoa (ChatGPT, Claude, Gemini). |
| 6 | Zero travessão, zero emoji | Gate: 0 ocorrências nas strings visíveis dos arquivos do escopo |
| 7 | Nunca a palavra que começa com "diagn" | Gate: 0 ocorrências |
| 8 | pt-BR com acentos e concordância | "Nota salvo" virou "Nota salva" (rótulo por gênero) |
| 9 | Botão = verbo + objeto | "Adicionar" virou "Adicionar link"; "Aprovar" virou "Aprovar o script"; "Ainda não" virou "Continuar enviando"; "Está bom assim" virou "Manter como está" |
| 10 | Erro diz o que fazer; ajuda por campo com até 2 linhas e exemplo concreto | "Erro ao carregar o script" virou "Não deu para carregar o script. Tente de novo."; "Use DDD + número (10 a 11 dígitos)..." virou "Digite o DDD e o número, como (11) 99999-9999." |

Comportamentos, `data-testid`, chaves, perguntas, `obrigatorio` e `passo` do JSON: intocados.

## Antes e depois, por tela

### Materiais (`components/script/MateriaisScreen.tsx`)

| Antes | Depois |
|--|--|
| Mande o que você já tem sobre como vende hoje. Quanto mais real, melhor fica o script. O que você envia aqui só você e o Danilo veem. | Mande o que você já usa para vender hoje. Quanto mais real, mais o script sai na sua voz. Só você e o Danilo veem o que você envia aqui. |
| O link precisa começar com https:// ou http:// | Cole o link completo, começando com https:// |
| Máx. 50MB por arquivo · PDF, Word, PowerPoint, Excel, CSV, TXT ou imagem | Até 50 MB por arquivo. Aceita PDF, Word, PowerPoint, Excel, CSV, TXT ou imagem. |
| Áudio e vídeo não sobem por aqui: mande o link do Drive (abaixo) ou pelo WhatsApp. | Áudio e vídeo não sobem por aqui. Cole o link do Drive na seção Links, logo abaixo, ou mande pelo WhatsApp. |
| Adicionar (botão de link) | Adicionar link |
| Nada enviado ainda. Sem material também dá: a ficha vem do que já temos. | Nada enviado ainda. Sem material também dá: a gente monta a ficha com o que já sabemos de você. |
| Já estamos processando o que você enviou. Você pode continuar enviando material e ir revisando a ficha. | Já estamos lendo o que você enviou. Pode continuar mandando material e ir revisando a ficha. |

### Materiais: prompt da IA (`materiais/categorias.ts`, `materiais/PromptIA.tsx`)

| Antes | Depois |
|--|--|
| Peça para a sua IA preencher (título) | Peça ajuda à IA que você já usa |
| Copie o prompt abaixo, cole no ChatGPT, Claude ou Gemini que você mais usa (de preferência um que já conheça a sua mentoria) e traga a resposta para cá. A sua IA responde com o que sabe de você, marcando o que tem certeza e o que é parcial ou incerto. | O ChatGPT, o Claude ou o Gemini que você já usa sabe muito sobre a sua mentoria. Em três passos, isso vira ficha. 1. Copie o prompt. 2. Cole na IA que você mais usa. Melhor se ela já conhece a sua mentoria. 3. Copie a resposta inteira e cole aqui embaixo. A resposta vem marcada: o que é certo e o que é parcial ou incerto. Sua ficha chega mais completa e o script sai mais parecido com você. |
| Não deu para carregar o prompt agora. | Não deu para carregar o prompt agora. Atualize a página e tente de novo. |
| Copie manualmente abaixo (botão) | Copie o texto abaixo |
| ### 1.1 [CERTO] ... (placeholder da resposta) | Cole aqui a resposta inteira, do jeito que veio. |

### Materiais: acesso à plataforma (`materiais/categorias.ts`, `materiais/AcessosPlataforma.tsx`)

| Antes | Depois |
|--|--|
| Guardamos este acesso só para extrair o conteúdo das suas aulas e transformar em base de conhecimento da sua IA. Só o Danilo vê. Você pode trocar a senha depois. | Usamos este acesso só para ler as suas aulas e levar o seu método para a ficha e para o script. Só o Danilo vê. Depois você pode trocar a senha. |
| O endereço precisa começar com https:// ou http:// | Cole o endereço completo, começando com https:// |
| URL da plataforma (https://...) (placeholder e aria-label) | Endereço da plataforma (https://...) |

### Materiais: confirmação de envio (`materiais/ConfirmarEnvioModal.tsx`)

| Antes | Depois |
|--|--|
| Use DDD + número (10 a 11 dígitos), com ou sem o 55. | Digite o DDD e o número, como (11) 99999-9999. |
| ...Quando terminar, avisamos você. | ...Quando tudo estiver pronto, a gente avisa. |
| Ainda não (botão) | Continuar enviando |

### Ficha do Script (`components/script/FichaScreen.tsx`)

| Antes | Depois |
|--|--|
| Não salvou. Tentamos de novo na próxima alteração. | Não salvou. Vamos tentar de novo na próxima alteração. |
| Preenchida pelos seus materiais. Seu script já está sendo gerado. Se editar algum campo... | Preenchida pelos seus materiais. Seu script já está sendo escrito. Se editar algum campo... |
| Tudo respondido. Seu script está sendo gerado. | Tudo respondido. Seu script está sendo escrito. |
| Não foi possível fechar a ficha agora. | Não deu para fechar a ficha agora. Tente de novo. |
| Não deu para pedir agora. | Não deu para pedir agora. Tente de novo. |
| Revise o que já encontramos sobre a sua mentoria: confirme, edite ou preencha. Cada campo mostra de onde veio. Faltou algo? Adicione contexto (áudio, foto, vídeo, link ou nota) e peça uma nova sugestão. Com a ficha fechada, a gente monta o script dos 7 passos da sua venda. | Revise o que já encontramos sobre a sua mentoria. Confirme, edite ou preencha. Cada resposta mostra de onde veio. Faltou algo? Grave um áudio, mande uma foto ou escreva uma nota e peça uma nova sugestão. Com a ficha fechada, a gente escreve o seu script dos 7 passos, na sua voz. |
| ...Ao responder a última, o script é gerado sozinho. (banner Quase lá) | ...Ao responder a última, a gente já começa a escrever o seu script. |
| Ao responder a última, o script é gerado sozinho: não precisa fechar a ficha. (rodapé) | Ao responder a última, a gente já começa a escrever o seu script. Não precisa fechar a ficha. |
| Agora a gente monta o script v1 dos 7 passos. Você recebe para ler e ajustar. | Agora a gente escreve a primeira versão do seu script dos 7 passos. Você recebe para ler e ajustar. |

### Ficha: passo a passo (`FichaWizard.tsx`, `FichaField.tsx`, `FichaNavegador.tsx`, `widgets/previa.ts`)

| Antes | Depois |
|--|--|
| Tudo respondido. Gerando o seu script. | Tudo respondido. Estamos escrevendo o seu script. |
| O resto a gente preencheu com os seus materiais. Ao responder a última, o script é gerado sozinho. | O resto a gente preencheu com os seus materiais. Ao responder a última, a gente já começa a escrever o seu script. |
| A meta entra no alto do script quando você decidir a oferta e a cadência. | A meta entra no alto do script quando você decidir a oferta e o ritmo de reuniões. |
| Não encontramos. Conte com a sua voz: grave um áudio ou escreva do seu jeito. (convite do campo vazio) | Não encontramos nos seus materiais. Grave um áudio ou escreva do seu jeito: é assim que o script sai na sua voz. |
| Não se aplica / deixar vazio (botão) | Não se aplica, deixar em branco |
| Meta: onde você quer chegar, com número e prazo. | Meta: onde você quer chegar, com número e prazo. É o que o script persegue. |
| Mentor: quem você é e o que te legitima a cobrar caro. | Mentor: quem você é e o que te autoriza a cobrar caro. É o que abre a conversa. |
| Mentorado: para quem, com dor, desejo, setor, bolso e território. | Mentorado: para quem você vende, com dor, desejo, setor, bolso e território. É com ele que o script fala. |
| Método: como você leva o cliente de A para B. | Método: como você leva o cliente de A para B. É o que o script apresenta. |
| A Mentoria: o que vai ao mercado como oferta. | A Mentoria: o que você oferece, com promessa, formato e preço. É a proposta do script. |
| Venda: como a venda acontece hoje. | Venda: como a venda acontece hoje. Define a voz e o ritmo do script. |
| Em revisão pela IA (legenda e ponto de estado) | Nova sugestão a caminho |
| Você decidiu tudo. Feche a ficha e a gente monta o script v1. | Você decidiu tudo. Feche a ficha e a gente escreve a primeira versão do seu script. |

### Ficha: complemento (`ComplementoCampo.tsx`)

| Antes | Depois |
|--|--|
| Está bom assim (botão) | Manter como está |
| O que você escreveu continua valendo; isto é aprofundamento. Incorporar anexa este texto ao seu para você ajustar. | O que você escreveu continua valendo. Este trecho só aprofunda. Se incorporar, ele entra no fim do seu texto e você ajusta como quiser. |

### Ficha: contexto por pergunta (`contexto/ContextoCampo.tsx`)

| Antes | Depois |
|--|--|
| A IA vai revisar este campo com o seu contexto. Aviso na tela quando a nova sugestão chegar. (toast) | Vamos refazer a sugestão deste campo com o que você mandou. Avisamos aqui quando ficar pronta. |
| Em revisão pela IA (selo) | Nova sugestão a caminho |
| Parar (botão do gravador) | Parar a gravação |
| Nota salvo. Quando terminar, peça a sugestão. (e "Link salvo", "Imagem salvo"...) | Nota salva. Quando terminar, peça a nova sugestão. (concordância por tipo: Áudio salvo, Imagem salva, Vídeo salvo, Link salvo, Nota salva) |
| A IA vai usar isto. Gravou errado? Exclua o item embaixo e grave de novo. | A gente usa este texto na nova sugestão. Gravou errado? Exclua o item embaixo e grave de novo. |
| Rótulo: o que tem nesse link (placeholder) | O que tem nesse link (opcional) |
| Escreva o que a IA precisa saber sobre esta pergunta (placeholder) | Escreva o que a gente precisa saber para acertar esta resposta |
| Faltou algo na sugestão? Anexe o que ajuda a IA a acertar e peça uma nova. | Faltou algo na sugestão? Grave um áudio, mande uma foto ou escreva uma nota e peça uma nova. |

### Seu script (`components/script/ScriptScreen.tsx`)

| Antes | Depois |
|--|--|
| Precisa de uma olhada do time. Já avisamos por aqui. | Nossa equipe está conferindo. Você não precisa fazer nada. |
| Deu um erro na escrita. O time já foi avisado; se quiser, peça uma nova versão. | Deu um erro na escrita. Nossa equipe já foi avisada. Se quiser, peça uma nova versão. |
| Erro ao carregar o script | Não deu para carregar o script. Tente de novo. |
| Erro ao abrir a versão | Não deu para abrir esta versão. Tente de novo. |
| Não deu para enviar o comentário. | Não deu para enviar o comentário. Tente de novo. |
| Aprovar o script v3? Você continua podendo comentar e pedir outra versão. | Aprovar esta versão do script? Você continua podendo comentar e pedir outra versão. |
| Não deu para aprovar agora. | Não deu para aprovar agora. Tente de novo. |
| Não deu para pedir agora. (3 lugares) | Não deu para pedir agora. Tente de novo. |
| Pedido feito: a próxima versão parte da v3 e dos comentários dela. Você recebe um aviso no WhatsApp quando ficar pronta. | Pedido feito: a próxima versão parte desta e dos seus comentários. Você recebe um aviso no WhatsApp quando ficar pronta. |
| Pedido feito com 3 grifos: a próxima versão parte da v3. Você recebe... | Pedido feito com 3 grifos: a próxima versão parte desta. Você recebe... |
| Não deu para salvar o grifo. | Não deu para salvar o grifo. Tente de novo. |
| Baixar (.md) (botão) | Baixar o texto |
| Aprovar (botão) | Aprovar o script |
| Gerar do zero (botão) | Escrever do zero |
| Selecione um trecho para grifar (dourado ajustar, verde manter, vermelho tirar), comente os passos e peça a nova versão: ela parte desta versão, dos grifos e dos comentários. "Gerar do zero" ignora tudo isso e escreve de novo a partir da ficha. | Selecione um trecho para grifar: dourado para ajustar, verde para manter, vermelho para tirar. Comente os passos e peça a nova versão. Ela parte desta versão, dos seus grifos e comentários. "Escrever do zero" ignora tudo isso e escreve de novo a partir da ficha. |
| Esta versão veio vazia. | Esta versão veio vazia. Peça uma nova versão. |

### Ajuda por campo (`data/script-ficha-fields.json`, só `ajuda`)

| Campo | Antes | Depois |
|--|--|--|
| 3.2 | Entra nas perguntas do Passo 2 e evita a objeção do decisor ausente (Passo 4). | Entra nas perguntas do Passo 2 e evita o 'preciso falar com meu sócio' no Passo 4. |
| 5.3 | No Passo 5 a opção mais alta vem primeiro: você ancora contra você mesmo. | No Passo 5 a opção mais alta vem primeiro. Assim a do meio parece justa. |
| 5.7 | Bônus sustentam a negociação (Passo 5) sem descontar o núcleo e matam objeção (Passo 4). | Bônus seguram o preço na negociação (Passo 5) e derrubam objeções (Passo 4). |
| 6.2 | Isso define em que voz o seu script será escrito. | Define em que voz o script é escrito: na sua ou na de quem vende por você. |

Os outros 30 textos de `ajuda`, as `previa` e os `template` já cumpriam as regras e ficaram como estavam.

## Testes ajustados (só as strings)

`tests/components/ComplementoCampo.test.tsx`, `FichaField.test.tsx`, `FichaWizard.test.tsx`, `FichaWizardFoco.test.tsx`, `ContextoCampo.test.tsx`, `ScriptScreen.test.tsx`, `tests/utils/scriptFields.test.ts`.

## Fora do escopo, para decisão do dono

| Onde | Texto | Por que ficou |
|--|--|--|
| `ScriptScreen.tsx` (cabeçalho e seletor) | "Script v3", opções "v1", "v2 (aprovado)", aviso "Nova versão pronta: v2" | Afirmado em `tests/components/ScriptReader.test.tsx`, que pertence ao agente do leitor. Sugestão: "Script, versão 3" e "Versão 2 (aprovada)". |
| `grifos/GrifosPanel.tsx` | Botões "Ir para" e "Apagar" | Mesmo motivo (ScriptReader.test). Sugestão: "Ir ao trecho", "Apagar grifo". |
| `data/script-ficha-fields.json` (`descricao` do bloco 3) | "ICP e avatar: dor, desejo, setor, bolso, território" | `descricao` de bloco vem do servidor e não está na lista de textos liberados (só `ajuda`, `previa`, `template`). Aparece no modo "Ver tudo". Sugestão: "Cliente ideal: dor, desejo, setor, bolso, território". |
| `ScriptScreen.tsx` | "Uma nova versão está sendo escrita do zero, a partir da ficha." | Já cumpre as regras; mantido. |

## Gates (04/09)

| Gate | Resultado |
|--|--|
| `npx tsc --noEmit` | Só os 4 erros pré-existentes (ActionPlanModule x3, useUserPersistence) |
| `npm test` | 56 arquivos, 536 testes, todos verdes |
| `npm run build` | OK (aviso de chunk grande já existia) |
| Grep nas strings visíveis do escopo | 0 travessão, 0 "diagn...", 0 jargão (job, cohort, worker, prefill, gate, runner, Naia), 0 emoji |
