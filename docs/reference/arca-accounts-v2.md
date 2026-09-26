# Contas v2 — conta por projeto, tela redesenhada, uso/cota e quem está usando

Status: planejado (2026-09-26). Dono: Gabriel Mendonça. Entrega alvo: 1.6.0.
Pedido do Gabriel, em ordem de chegada: conta fixa por projeto; configurável também no
menu "⋯" do projeto na barra lateral; tela de contas redesenhada; gráficos de uso e cota;
ver quem está usando cada conta.

## Estado de partida (1.5.10)

- Fonte única de contas: bucket do Pi `~/.pi/agent/accounts.json`
  (`{version:1, active:{provider:name}, accounts:{provider:{name:cred}}}`,
  cred `{type:'oauth', access, refresh, expires, accountId?}`) + slot `~/.pi/agent/auth.json`.
- Duas implementações do mesmo formato, que precisam continuar equivalentes:
  - Pi: `~/ARCA/arca/extensions/accounts.ts`, `extensions/lib/accounts-core.ts`,
    `lib/account-mirror.ts`, `lib/auth-lock.ts` (teste `test/accounts_core.test.ts`).
  - App: `src/main/pi-accounts/` (service, mirror, files, auth-lock, pi-account-login,
    credential-conversion, bucket-account-edits), UI
    `src/renderer/src/components/settings/PiAccountsSection.tsx` + `pi-account-dialogs.tsx`.
- Lock compartilhado `auth.json.lock` (wx, stale 30 s) em toda escrita de auth/bucket.
- App já faz: listar, Usar, Adicionar (login Claude/Codex reaproveitando os fluxos
  gerenciados do Orca), Renomear, Remover. client_id OAuth do app == do Pi (anthropic
  `9d1c250a-…`, openai-codex `app_EMoamEEZ73f0CkXaXp7hrann`).
- Contas gerenciadas do Orca ficam escondidas com `ARCA_PI_IS_AUTHORITY`.
- Uso/cota hoje: só da conta ativa, na barra de status (`src/main/rate-limits/`,
  `claude-usage`, `codex-usage`; `claude-managed-account-usage.ts` já consulta contas
  inativas gerenciadas).

## Restrições que qualquer desenho tem que respeitar

1. O Pi lê um único `auth.json` por pasta de agente; não há env para outro arquivo de
   auth. `PI_CODING_AGENT_DIR` troca a pasta inteira (sessões, extensões, settings).
2. Anthropic rotaciona o refresh token a cada refresh (uso único). Duas sessões em contas
   diferentes não podem ambas gravar o slot global; duas sessões na mesma conta não podem
   renovar ao mesmo tempo sem lock por conta.
3. Subagentes são processos `pi` filhos (`~/ARCA/arca/extensions/subagent`) e precisam
   herdar a conta do projeto.
4. Pi Black (overlay `arca-pi`) faz o anthropic usar OAuth de assinatura; o override por
   projeto não pode cair para cobrança por API.
5. Tokens nunca vão para o renderer nem para o Mainframe.
6. Windows é a plataforma principal dos sócios (EPERM/EBUSY, `pi.cmd`, sem Keychain).

## Etapas

### 1. Mecanismo de conta por sessão (decisão pendente — planner em andamento)
Pergunta aberta: uma extensão do Pi consegue, por processo, usar uma credencial OAuth
diferente da do `auth.json` (incl. refresh) para `anthropic` e `openai-codex`, preservando
Pi Black e valendo para subagentes? Candidatos:
- a) extensão resolve o projeto pelo cwd no início da sessão e injeta a credencial da
  conta mapeada em memória (runtime credential), com refresh próprio sob lock por conta
  (`accounts.json.<provider>.<name>.lock`) gravando a rotação de volta no bucket;
- b) env injetada pelo app no PTY (`ARCA_PI_ACCOUNT_<PROVIDER>=<nome>`) lida pela mesma
  extensão, herdada por subagentes;
- c) `PI_CODING_AGENT_DIR` por projeto com symlinks — provavelmente descartada (duplica
  sessões/settings).
Critério de pronto: nota de decisão aqui com arquivo:linha da API usada e prova de que
duas sessões simultâneas em contas diferentes não derrubam uma à outra.

### 2. Mapeamento projeto → conta
- Arquivo `~/.pi/agent/accounts.json` ganha `projects: { "<caminho relativo ao ~/ARCA>":
  { anthropic?: name, "openai-codex"?: name } }` (bump para `version: 2` com leitura
  compatível de v1 nos dois lados) — ou arquivo separado `account-projects.json`; decidir
  na etapa 1.
- Resolução: cwd → repo do catálogo `~/ARCA/arca/projects.json` (caminho mais longo que
  contém o cwd, case-insensitive no Windows); sem mapeamento → conta ativa global.
- Escritores: app (menu, Project Settings, tela de contas) e `/accounts project
  <provider> <nome|default>` no Pi, ambos sob o lock.

### 3. Superfícies de configuração (mesma configuração, quatro lugares)
- Menu "⋯" do projeto na barra lateral: item **Conta** com submenu por provedor
  (Claude › contas…, "Conta ativa (padrão)"), ✓ na escolhida.
- Selo discreto ao lado do nome do projeto só quando há conta fixa.
- Project Settings: mesma escolha com descrição.
- Tela de contas: lista "Projetos" com seletor por projeto.
- `/accounts` lista o mapeamento e troca.

### 4. Tela de contas redesenhada
- Um card por provedor com ícone e nome humano ("Claude", "Codex"), não
  `anthropic`/`openai-codex`.
- Cada conta: nome + e-mail, selo "Ativa", ações num menu "⋯" (Usar, Renomear, Remover).
- "Adicionar conta" em destaque dentro do card.
- Textos técnicos (SSH/WSL, reiniciar terminais) em "Detalhes" recolhido.
- Megamind, Gemini e OpenCode em seções separadas das contas do Pi.

### 5. Uso e cota por conta
- Barras de cota (janela 5 h e semanal) com % e tempo até renovar, cores por faixa, para
  TODAS as contas (ativas e inativas).
- Gráfico de uso 24 h / 7 dias por conta; histórico gravado localmente pelo app a partir
  desta versão (amostras periódicas; sem histórico retroativo).
- Consulta de conta inativa pode exigir refresh: gravar a rotação no bucket sob o lock
  (mesmo cuidado de B1/B2 da revisão de credenciais), nunca em memória só.
- Quais projetos usam cada conta.

### 6. Quem está usando cada conta
- O app/Pi publica na presença do Megamind apenas `{provider, accountName, email?,
  project}` da conta em uso por sessão — nunca token.
- Tela de contas: "em uso agora por: Gabriel · MacBook · isaro"; último uso por pessoa.
- Alerta quando duas pessoas usam a mesma conta e a cota passa de ~80%.
- Limite: uso fora do ARCA/Pi (navegador, celular) não aparece, mas já entra na cota.
- Exige mudança no Mainframe (contrato de presença em `arca/extensions/arca-megamind/contract.ts`
  e no gateway MCP); coordenar via Megamind.

## Verificação por etapa

- Contrato: fixtures compartilhadas entre `arca/test/accounts_core.test.ts` e
  `src/main/pi-accounts/*contract*.test.ts` (v1 e v2 do bucket).
- Etapa 1: teste com duas sessões simultâneas em contas diferentes + refresh concorrente
  na mesma conta (dirs temporários, fetch falso). Nunca tocar `~/.pi/agent`, `~/.codex`,
  `~/.claude`, Keychain reais em teste.
- App: `pnpm tc`, vitest dos diretórios tocados, oxlint (+ design-system), 4
  `verify:localization-*`, teste de boundary de `child_process`, `git diff --check`.
- Manual (Gabriel no Mac, sócios no Windows): projeto A na conta X e projeto B na conta Y
  abertos ao mesmo tempo com subagentes; troca pelo menu; gráfico de cota; "em uso por".

## Fora de escopo da v1
- Conta por aba/agente dentro do mesmo projeto.
- WSL/SSH (continuam no `/accounts` do host).
- Grok, Gemini, OpenCode.
