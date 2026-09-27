# Autoridade de agente por máquina (`pi` | `managed`)

Quem é o dono das credenciais de agente **não é uma constante do produto**: é um modo por
computador, resolvido no main e espelhado no renderer.

- `pi` — máquinas do Gabriel. O bucket do Pi (`~/.pi/agent/accounts.json`) é a fonte das contas,
  a conta por projeto do Pi vale, e as telas de conta gerenciada do Claude/Codex herdadas do Orca
  ficam escondidas.
- `managed` — máquinas dos sócios. O agente é Claude Code/Codex: as seções Orca de conta voltam,
  nada de Pi é registrado (`pi-accounts`, `pi-account-usage`, mapa projeto → conta Pi, env
  `PI_ACCOUNT_*` no PTY) e o **stand-down de contas gerenciadas nunca roda**.

## Regra

`src/shared/agent-authority.ts` é o contrato. A setting `arca.agentAuthority`
(`'auto'` padrão | `'pi'` | `'managed'`, em Configurações › Contas) vence sempre; em `auto` o modo
é `pi` somente se **as duas** condições valerem:

1. `pi --arca-capabilities` responde `{"accountEnv": 1}`
   (`src/main/pi-accounts/pi-account-capabilities-probe.ts`, cache em
   `pi-account-selection-support.ts`); e
2. a máquina **não** tem conta gerenciada Claude/Codex de host — nem criada nem apenas selecionada
   (`hasManagedHostAgentAccounts`). Contas WSL não contam: a credencial delas mora na distro.

Por quê a segunda: entrar em `pi` dispara o stand-down, que **desseleciona** a conta host do
sócio. Um Pi patchado instalado na máquina não é prova de que o Pi é o dono dali; uma conta
gerenciada em uso é prova do contrário.

`shouldStandDownManagedHostAccounts` é quem autoriza o stand-down
(`standDownManagedHostAccountsForPiAuthority`): preferência explícita `pi`, ou `auto` numa máquina
sem conta gerenciada a perder. O modo é recalculado também quando as contas gerenciadas ou a
seleção ativa mudam.

## Estado inicial: `managed`, não resolvido

Enquanto a sonda não respondeu, o modo é `managed` com `resolved: false`.

- **Por que `managed`**: máquina sem Pi patchado é o caso comum, e as superfícies Pi lá seriam
  inertes. Registrar o Pi antes da prova seria escrever no lugar errado; esconder o Pi por um
  instante não perde nada.
- **Por que `resolved` separado**: quem pinta conta (tela de Contas) espera `resolved` e mostra
  "verificando" em vez de piscar as seções do dono errado. Superfícies secundárias (menus da barra
  de status) só seguem o modo.

## Mudança em runtime

O modo é recalculado quando a setting muda e quando a sonda muda de resposta. A sonda **não** é
repetida em timer (forkar `pi` de minuto em minuto é custo e sinal de EDR no Windows): ela é
refeita quando a tela de Contas abre (`refreshAgentAuthority`) e a cada troca explícita da setting.
Cada transição roda `applyPiAuthorityRegistrations`, que registra ou remove os handlers IPC do Pi.

## Onde não é modo

`ARCA_ORCA_AGENT_SKILLS_HIDDEN` e `ARCA_ONBOARDING_SKIPS_INTEGRATIONS`
(`src/shared/arca-product.ts`) continuam constantes: os três cards de skill do Orca
(orquestração/browser/computer use) não voltam para os sócios — o equivalente vem do instalador do
`arca` — e o passo de integrações do onboarding segue pulado. O passo de CLI vale nos dois modos; só
o texto muda (Pi vs Claude Code/Codex).
