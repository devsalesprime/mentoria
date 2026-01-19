# Prosperus Club - Diagnóstico de Mentoria High-Ticket

Este é um sistema de diagnóstico interativo desenvolvido para o **Prosperus Club**. O objetivo da aplicação é guiar mentores e especialistas através de uma jornada estruturada para "empacotar" seu conhecimento em uma oferta de mentoria de alto valor (High-Ticket).

Diferente de formulários comuns, esta aplicação oferece uma experiência imersiva, com validações rigorosas, design premium e feedback de Inteligência Artificial.

---

## 🏗️ Arquitetura e Stack Tecnológica

O projeto foi construído focando em performance, estética e interatividade.

- **Frontend:** React 18 (TypeScript)
- **Backend:** Node.js com Express
- **Banco de Dados:** SQLite (Armazenamento local em arquivo `data/prosperus.db`)
- **Estilização:** Tailwind CSS (Design System personalizado com cores Dourado/Navy)
- **Animações:** Framer Motion (Transições de página, drag-and-drop, modais)
- **IA:** Google Gemini API (via `@google/genai`) para análise de respostas e geração de planos de ação.
- **Automação:** Webhoook n8n acionado ao completar 100% do progresso.
- **Ícones:** Bootstrap Icons.

---

## 🚀 Fluxo Geral do Usuário

1.  **Landing Page (Hero):** Apresentação da promessa ("Construa sua Mentoria de 60k").
2.  **Login/Validação:** Verificação via API HubSpot para garantir acesso apenas a membros com negócios ganhos (`closedwon`). Se o email existir e tiver o deal correto, um token JWT é gerado.
3.  **Dashboard (Visão Geral):** Central de controle onde o usuário visualiza seu progresso nos 4 pilares.
4.  **Módulos:** O usuário deve completar os módulos sequencialmente ou conforme necessidade (com validação de dependências).
5.  **Plano de Ação:** Após preencher os dados, a IA gera um diagnóstico estratégico.

---

## 🧩 Detalhamento dos Módulos

### 1. Módulo: O Mentor (Identidade e Autoridade)
Foca na extração da história e posicionamento do especialista.
*   **Pitch:** Definição clara do que faz (validado por IA).
*   **Linha do Tempo:** Momentos marcantes da carreira.
*   **Pódio das Conquistas:** Top 3 resultados que geram autoridade.
*   **MVV:** Missão, Visão e Valores.
*   **Equipe:** Estrutura atual de bastidores.
*   **Depoimentos:** Cadastro de provas sociais (com upload de imagem/link).
*   **Diferenciação:** Comparativo "Padrão de Mercado" vs "Minha Diferença".

### 2. Módulo: O Mentorado (Público-Alvo)
Define quem compra. Possui dois fluxos distintos baseados na resposta inicial:
*   **Fluxo "Já tenho clientes" (Hipótese):**
    *   *Radar de Personas:* Drag-and-drop para posicionar perfis de clientes baseado em confiança.
    *   *Mapa Fã vs Hater:* Definição comportamental e emocional.
    *   *Comunidade:* Quem entra e quem não entra.
*   **Fluxo "Não tenho clientes" (Deep Dive):**
    *   *Demografia:* Wizard detalhado (Idade, Gênero, Localização, Presença Digital).
    *   *Transformação:* Comparativo Antes (Dores) vs Depois (Ganhos).
    *   *Montanha da Decisão:* Motivação (Topo), Barreiras (Muro) e Superação (Martelo).
    *   *Jornada de Consumo:* Mapeamento passo a passo de como o cliente descobre a marca.
    *   *Alvo (Bullseye):* Definição visual das características mais importantes.

### 3. Módulo: O Método (Processo de Entrega)
Estrutura como a transformação é entregue.
*   **Seleção de Estágio:** "Ainda não tenho", "Tenho na cabeça" ou "Tenho estruturado".
*   **Estruturação (Fluxo Estruturado):** Interface específica para nomear o método, definir a promessa única e os 3+ pilares fundamentais.
*   **Propósito (Fluxo Padrão):** Mapeamento do Ponto A (Dor/Fracasso) ao Ponto B (Vitória/Sentimento).
*   **Mapa da Jornada:** Criação visual dos passos macro (timeline horizontal).
*   **Raio-X:** Análise detalhada de cada etapa da jornada, listando Problemas (travas) e Soluções (ferramentas) para cada uma.

### 4. Módulo: A Oferta (Entrega e Logística)
Formata o produto final comercializável.
*   **Identidade:** Nome do Grupo e Objetivo Único.
*   **Obrigatórios:** Frequência de encontros presenciais, rituais de engajamento online e regras da comunidade.
*   **Overdelivery:** Definição de entregas extras (Sessões 1:1) e Aceleradores (ferramentas prontas/templates).

---

## 🤖 Integração com Inteligência Artificial

O sistema utiliza a **Google Gemini API** em dois momentos cruciais:

1.  **Feedback em Tempo Real (Módulo Mentor):**
    *   O usuário pode clicar em "Validar com IA" em campos de texto aberto (como o Pitch).
    *   A IA analisa clareza, autoridade e persuasão, retornando uma nota (0-100) e sugestões de melhoria.

2.  **Plano de Ação (Módulo Final):**
    *   Cruza os dados de todos os módulos (Mentor + Mentorado + Método).
    *   Gera um diagnóstico completo com: Score de Venda, Pontos Fortes, Pontos Cegos e um Plano Tático para a próxima semana.

---

## 🛠️ Instalação e Configuração

### Pré-requisitos
*   Node.js (v18+) instalado.
*   Conta e Token Privado do HubSpot (Private App Token).
*   Chave de API do Google Gemini.

### Configuração de Variáveis de Ambiente

Renomeie o arquivo `.env.example` para `.env` (ou crie um novo) na raiz do projeto com as seguintes chaves:

```env
# Configurações do Servidor
PORT=3005
JWT_SECRET=sua_chave_secreta_para_tokens

# Integrações CRM (HubSpot)
HUBSPOT_PRIVATE_TOKEN=seu_private_token_hubspot
HUBSPOT_WIN_STAGE=closedwon

# Configuração Cliente (Frontend)
VITE_API_KEY=sua_chave_gemini_api
```

### Comandos Disponíveis

1.  **Instalar dependências:**
    ```bash
    npm install
    ```

2.  **Iniciar Servidor (Backend):**
    ```bash
    npm start
    ```
    *O servidor iniciará na porta 3005 e criará o banco de dados SQLite automaticamente.*

3.  **Iniciar Frontend (Desenvolvimento):**
    ```bash
    npm run dev
    ```
    *A aplicação estará disponível em http://localhost:5173*

---

## 🎨 Diretrizes de UI/UX

*   **Validação Rigorosa:** O usuário não pode avançar etapas sem preencher campos obrigatórios.
*   **Feedback Visual:** Indicadores de salvamento automático ("Salvando...", "Salvo"), barras de progresso e modais de confirmação.
*   **Responsividade:** Layout adaptável para Mobile e Desktop.
*   **Dark Mode:** A aplicação é nativamente escura para transmitir sofisticação e conforto visual.

---

Desenvolvido para **Sales Prime / Prosperus Club**.
