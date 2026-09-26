# Contas v2 — conta por projeto, tela redesenhada, uso/cota e quem está usando

Status: etapa 1 **bloqueada pela API pública do Pi** (2026-09-26); etapas 2–6 não iniciadas.
Dono: Gabriel Mendonça. Entrega alvo: 1.6.0.
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
- App e extensão usam `auth.json.lock` (arquivo `wx`, stale 30 s) em parte das escritas.
  A investigação da etapa 1 encontrou gravações do bucket sem lock no core e protocolo
  diferente no runtime Pi (diretório `proper-lockfile`); não há lock universal hoje.
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

### 1. Mecanismo de conta por sessão — BLOQUEADO

**Decisão: não habilitar contas por projeto nem avançar às etapas 2–6.** O contrato
público suportado de extensão do Pi instalado não permite substituir a origem da
credencial da sessão normal, mantendo os IDs `anthropic`/`openai-codex` e o slot global intocado. Registrar
outro provider com o mesmo ID não substitui o `CredentialStore` do agente.

A [prova negativa reproduzível](../../tests/tools/pi-accounts-session/README.md) executa
dois CLIs Pi A/B simultâneos, compartilhando o mesmo agentDir/auth global sentinela.
Para Claude **e** Codex, a credencial global vence o resolver do bucket. Remover OAuth
não produz fallback; substituir `refresh` persiste seu retorno no store global.
Os arquivos sentinela permanecem byte a byte iguais. Rede bloqueada, somente credenciais
fictícias; nenhuma alteração no runtime instalado ou nas credenciais reais.

**Um teste verde aqui confirma o bloqueio, não a entrega da etapa 1.** Streaming
Pi Black, rotação concorrente e subagentes continuam sem prova de isolamento.
O critério original permanece: duas sessões em contas distintas + subagentes e refresh
simultâneo na mesma conta, sem interferência no slot global ou perda de rotação.

Próximo passo exige autorização para alterar **uma cópia isolada do runtime Pi**:
expor à extensão um override de credenciais por sessão/provider antes da resolução.
Preferir reutilizar o `CredentialStore` público já aceito pelo SDK; uma ponte para
runtime API key é outra opção, mas exige provar status de assinatura e lifecycle.
Nenhuma dessas APIs novas foi implementada nesta rodada. Após a ponte, repetir a prova
com servidor OAuth fictício independente do bucket e tratar os escritores abaixo.

Alternativas avaliadas:
- a) seleção por cwd + credencial em memória: precisa da ponte pública acima;
- b) `ARCA_PI_ACCOUNT_<PROVIDER>` herdada: transporta a seleção, mas não muda a
  precedência de autenticação; sozinha não resolve;
- c) `PI_CODING_AGENT_DIR` por projeto: descartada por separar sessões/settings e não
  cumprir a configuração compartilhada. Alias de provider e acesso privado não foram
  aceitos como substitutos silenciosos do requisito.

Trabalho isolado em `/tmp/arca-accounts-v2-wt`, branch `arca-accounts-v2`. O planner
anterior foi interrompido, sem resultado final. A decisão acima vem de código e prova
executável, não daquele planner.

#### Evidências da API pública

O Pi instalado (`0.87.1-f07218c4d4-e68205c8d3-d5be92cc15`) documenta
`pi.registerProvider(provider)` com o `Provider` nativo, além da configuração legada.
O contrato público em `@earendil-works/pi-ai/dist/models.d.ts:58–99` separa `auth`,
`getModels`, `stream` e `streamSimple`. A hipótese a provar é substituir somente a
autenticação e delegar catálogo/stream aos providers nativos.

Isso **não basta** para provar seleção por sessão: `pi-ai/dist/auth/resolve.js:40–54`
consulta primeiro a credencial persistida daquele provider. Um OAuth global impede o
resolver de API key de ser chamado; remover o handler OAuth retorna "não configurado",
não libera o resolver alternativo. `ModelRuntime.setRuntimeApiKey` existe no SDK, mas
`ExtensionContext.modelRegistry` não o expõe — seu `runtime` é privado na declaração
TypeScript, embora acessível em JavaScript. A investigação respeita essa fronteira
pública, não trata acesso a internals como API suportada.

O bloqueio é **contratual**, não uma impossibilidade de contornar o runtime em JS.
Retornar `undefined` de `oauth.refresh` pode evitar a gravação no store atual, mas viola
seu retorno `Promise<OAuthCredential>`; renovar o bucket dentro de `toAuth` viola a
exigência de ausência de efeitos colaterais. Esses contornos não foram adotados nem
executados pela prova. A revisão distinguiu explicitamente esse limite da precedência
e persistência que os testes de fato reproduzem.

Uma primeira prova foi descartada antes da aceitação: criava `PI_CODING_AGENT_DIR` e
`auth.json` diferentes por conta. Esse teste só demonstraria o isolamento de pastas já
conhecido, não a restrição desta etapa. A prova aceita deve compartilhar a pasta do agente
**e o mesmo slot global sentinela**, selecionar A/B somente pelo bucket e verificar que
o slot global não mudou. O servidor OAuth fictício também precisa rejeitar reuso com
estado independente do bucket, não comparar apenas com o arquivo do cliente.

O comportamento Pi Black/Claude Code está no adapter instalado
`pi-ai/dist/api/anthropic-messages.js` (`createClaudeCodeFetch` e cabeçalhos OAuth),
não depende de o filho carregar uma extensão de branding. Já a extensão de **seleção
de conta** precisa ser carregada explicitamente: o runner atual de subagentes usa
`--no-extensions` (`arca/extensions/subagent/runner.ts:310`). Herdar uma variável de
ambiente sozinha não habilita a seleção no filho. O runner já tem precedente de carga
explícita para uma extensão obrigatória (`childGate`, linhas 327–346); reutilizar esse
ponto de lançamento ao implementar a seleção, sem criar outro runner de subagentes.

#### Riscos já confirmados para a implementação

- O lock atual do app/core não é o mesmo protocolo do runtime Pi instalado:
  `src/main/pi-accounts/auth-lock.ts:27` cria arquivo com `wx`; o
  `dist/core/auth-storage.js:85` do Pi usa `proper-lockfile`, que cria diretório.
  Uma sonda em `/tmp` confirmou o diretório e `ELOCKED` diante do arquivo criado pelo
  app. O nome igual não basta para garantir recuperação de lock compatível.
- Os escritores atuais carregam o bucket antes do lock e releem apenas `auth.json`
  ao gravar (`service.ts`, `switchAccount`/`remirrorActive`; no core, `commit`).
  Um refresh por conta pode ser perdido ao sobrescrever um snapshot antigo do bucket.
- `captureSlots`/`sync` copiam o slot ativo para o bucket; se o bucket passar a ser
  autoridade do refresh, essa cópia pode restaurar um refresh token já invalidado.
- Lock de conta isolado não protege contra runtime antigo, espelhamento ou CLI externo
  renovando a mesma credencial fora desse protocolo. A prova isolada da API não autoriza
  habilitar isso sobre dados reais antes de tratar todos esses escritores nos dois repos.
- No core, `save`/`rename`/`remove` também gravam o bucket sem lock. A fila do app
  serializa apenas operações dentro daquele processo; não protege contra outra sessão Pi.
- O lock `wx` atual não renova sua idade e pode ser roubado após 30 s. Não reutilizá-lo
  para envolver uma chamada de rede longa sem rever posse, heartbeat e recuperação.
- A seleção de uma conta exige definir quem renova **aquela credencial**, inclusive se
  ela também for a conta global ativa ou estiver duplicada sob outro nome. Trocar entre
  slot global e bucket conforme o `active` muda não é uma solução demonstrada. CLIs
  externos e runtimes antigos não participam automaticamente de um novo lock.
- Rename/remove hoje protegem apenas a conta ativa global, não contas em uso por sessões.
  A implementação precisa definir invalidação/rejeição sem recriar entradas removidas.
- Não aumentar `accounts.json.version` sem migração: o app atual exige `z.literal(1)`.
  Compatibilidade entre versões e atualização coordenada dos escritores são parte do gate.
- Em SSH/WSL, seleção, bucket e lock pertencem ao host de execução; um teste local não
  comprova esse transporte. O projeto pode ser uma pasta sem Git, não apenas worktree.

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
