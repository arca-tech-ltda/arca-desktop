# Conta gerenciada por projeto (Claude Code / Codex) — modo `managed`

Fase D de `arca/docs/decisao-agente-dos-socios.md`. Vale **só** no modo `managed` da autoridade por
máquina (ver [`arca-agent-authority.md`](./arca-agent-authority.md)); no modo `pi` nada disto existe
e a conta por projeto continua sendo a do bucket do Pi
([`arca-accounts-v2.md`](./arca-accounts-v2.md)).

## O que é

Cada projeto pode fixar uma conta gerenciada do Claude Code e/ou do Codex — as contas que o fork já
herdou do Orca (`src/main/claude-accounts`, `src/main/codex-accounts`). As decisões são as mesmas
das contas v2 do Pi:

- conta padrão por projeto; sem conta fixa, vale a seleção global de sempre;
- "Novo Claude/Codex com conta…" no menu da aba escolhe outra conta só para aquele terminal;
- selo com a conta na aba e ao lado do nome do projeto;
- mudar o mapa afeta só terminais novos; os abertos continuam na conta em que começaram;
- conta indisponível **bloqueia** o launch com mensagem; nunca cai em outra conta em silêncio;
- só host local: SSH e WSL têm suas próprias credenciais, do outro lado.

## Peças

| Papel | Arquivo |
|---|---|
| Contrato (agentes, chaves de env, mapa, mensagens) | `src/shared/managed-account-projects.ts` |
| Normalização de caminho e resolução por cwd, comum ao mapa do Pi | `src/shared/project-account-paths.ts` |
| Mapa projeto → id de conta (`<userData>/managed-account-projects.json`) | `src/main/managed-account-projects/managed-account-project-map.ts` |
| Injeção no PTY | `src/main/managed-account-projects/managed-account-pty-env.ts` |
| Home da conta do Claude (resolução + credencial) | `src/main/managed-account-projects/managed-account-homes.ts` |
| Espelhamento hooks/MCP/skills do Claude | `src/main/managed-account-projects/claude-managed-home-resources.ts` |
| Pin do Codex lido no launch | `src/main/managed-account-projects/pinned-codex-launch-account.ts` |
| Bloqueio de remoção | `src/main/managed-account-projects/managed-account-removal-guard.ts` |
| IPC (registrado/desregistrado junto com o modo) | `src/main/managed-account-projects/registration.ts`, `src/main/startup/agent-authority-registrations.ts` |
| UI dos dois modos | `src/renderer/src/components/settings/use-project-accounts.ts` e os componentes `ProjectAccount*` / `NewAgentWithAccountMenu` |

O mapa guarda **id** de conta gerenciada (não e-mail): o e-mail muda de exibição, o id é o dono do
diretório. Contas WSL nunca entram na lista — a credencial delas mora dentro da distro.

## Como a conta chega no terminal

`applyManagedAccountPtyEnv` roda no mesmo ponto do `applyPiAccountPtyEnv`
(`src/main/ipc/pty/ipc/spawn-env.ts` e o caminho de runtime). Ele resolve o pin (env explícito do
"Novo … com conta…" vence o mapa do projeto) e escreve:

- `ARCA_MANAGED_ACCOUNT_CLAUDE` / `ARCA_MANAGED_ACCOUNT_CODEX`: marcador privado do app com o id.
- **Claude**: `CLAUDE_CONFIG_DIR` (+ `CLAUDE_SECURESTORAGE_CONFIG_DIR`) apontando para
  `<userData>/claude-accounts/<id>/auth`, o diretório que o Orca já prova ser dele
  (`resolveOwnedClaudeManagedAuthPath`).
- **Codex**: nada de `CODEX_HOME` aqui. Quem resolve a home é a preparação de launch que já existe
  (`prepareForCodexLaunch`), que lê o marcador do env (`readPinnedCodexManagedAccountFromEnv`) e usa
  a home própria daquela conta. Assim readiness, instalação de hooks, mirror de `config.toml` e a
  ponte de sessões continuam sendo o código do Orca, e a **seleção global não muda**.

Fora do host local (SSH, WSL) ou fora do modo `managed`, a função apaga qualquer marcador que já
estivesse no env: um id desta máquina não significa nada do outro lado.

## Hooks, MCP e skills nas homes gerenciadas

Claude e Codex leem hooks, servidores MCP e skills do **config dir ativo**. Apontar
`CLAUDE_CONFIG_DIR`/`CODEX_HOME` para a home da conta, sem mais nada, deixaria o terminal sem os
hooks de status do app, sem o MCP `arca-megamind` que o instalador do `arca` registrou
(`claude mcp add -s user` / `codex mcp add`) e sem as skills.

- **Codex**: nada novo. `syncSystemCodexResourcesIntoManagedHome` já linka `skills`, `hooks`,
  `prompts`, `AGENTS.md`… de `~/.codex`, `syncSystemConfigIntoManagedCodexHome` espelha o
  `config.toml` (onde vive `mcp_servers`) e o caller instala os hooks na home retornada. O pin só
  passa a usar esse mesmo caminho para outra conta.
- **Claude**: `syncClaudeManagedHomeResources` faz, de forma idempotente e só de mão única (home
  real → home gerenciada):
  - `settings.json` da home gerenciada ganha os hooks gerenciados do app e a statusline (a mesma
    `applyManagedHooks`/`applyManagedStatusLine` do `claudeHookService`), e só é reescrito quando
    muda;
    Antes disso, `settings.json` herda de `~/.claude/settings.json` **apenas** `permissions`,
    `model` e `env`, e só as chaves que a conta ainda não definiu (`hooks` e `statusLine` nunca vêm
    de lá — são do app);
  - `.claude.json` recebe **apenas** o bloco `mcpServers`, o `hasCompletedOnboarding` e, por
    projeto, `hasTrustDialogAccepted` e `allowedTools` do `~/.claude.json`, e só as entradas que
    ainda não existem lá — histórico de projetos, `oauthAccount` e qualquer token **nunca** são
    copiados;
  - `skills`, `commands` e `CLAUDE.md` viram link (junction no Windows) para os do `~/.claude`, com
    cópia como fallback, e um item já existente nunca é sobrescrito.

**Credencial nunca é espelhada entre contas.** No macOS o Claude escopa o item de Keychain pelo
hash do config dir: `materializeClaudeManagedCredential` semeia **somente** o item daquele config
dir (nunca o item padrão, que é da conta globalmente selecionada) e só quando ele está ausente, para
não sobrescrever um token que o próprio Claude já rotacionou. Isso roda ao fixar a conta e de novo
antes de um spawn vindo do IPC.

## Bloqueios

`assertManagedAccountRemovable` recusa remover uma conta fixada em algum projeto ou em uso por um
terminal aberto (a lista de terminais vivos vem do renderer, que chama `syncOpenTabs` logo antes da
remoção). Contas gerenciadas não têm rename — a identidade é o e-mail do login —, então o
equivalente do rename das contas v2 não se aplica.

## Limites conhecidos

- O registro de atribuição de pane do Codex (`codex-pane-account-registry`) grava a conta
  **selecionada globalmente**, não o pin, quando o launch não vem de um resume. Um pane fixado pode
  aparecer no aviso de "pane em conta antiga" atribuído à conta errada; o launch em si usa a conta
  certa.
- Uso/cota por conta continua sendo o da conta ativa; a fase D não mexe nisso.
- O caminho de spawn do runtime (cliente web/mobile) é síncrono: ele injeta o pin, mas depende da
  materialização de credencial feita ao fixar a conta (ou por um spawn anterior pelo IPC).
