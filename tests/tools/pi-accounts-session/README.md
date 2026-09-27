# Contas v2 — etapa 1 BLOQUEADA

A prova anterior está **CANCELADA**, não validada nem reaproveitada como prova de
isolamento de contas. O **contrato público suportado** de extensão do Pi instalado
não oferece o controle necessário para ignorar o OAuth global durante toda a sessão
normal, mantendo `anthropic` / `openai-codex` e sem gravar `auth.json`. Não é uma
alegação de impossibilidade em JavaScript: os contornos fora do contrato estão abaixo.

Runtime inspecionado, somente leitura:
`0.87.1-f07218c4d4-e68205c8d3-d5be92cc15` (`pi-coding-agent` / `pi-ai` 0.87.1).
Nenhuma alteração de runtime ou produção foi feita. A investigação para aqui.

## Prova negativa reproduzível

`pi-accounts-session.test.mjs` inicia **dois CLIs Pi reais A/B em paralelo** via
`runProcess` do projeto. Ambos usam o **mesmo** `PI_CODING_AGENT_DIR`, `HOME`,
`accounts.json` e `auth.json` temporários. Uma barreira em `session_start` exige
que os dois processos estejam presentes antes das sondas.

- O único `auth.json` contém OAuth **GLOBAL sentinela**, válido, para ambos os
  providers. Nunca contém A/B. As contas A/B existem somente no bucket.
- A extensão registra os providers nativos, com os mesmos IDs, catálogo e funções
  de stream; acrescenta um `apiKey.resolve` que selecionaria a conta no bucket.
- Para **Anthropic e Codex**, `ctx.modelRegistry.getProviderAuth` devolve o global,
  não a conta selecionada. O resolver do bucket não é chamado.
- Remover `auth.oauth` não força o resolver: a resolução retorna `undefined`,
  ainda sem chamar `apiKey.resolve`.
- Uma sonda separada usa o `createModels` real e um `CredentialStore` em memória.
  Com global expirado, `oauth.refresh` recebe o global; retornar a conta do bucket
  gera uma mutação dessa conta no store global. A sonda registra a mutação em
  memória, **não escreve esse resultado no auth compartilhado**.
- Controle positivo: `getAuth(id, { apiKey: 'synthetic-runtime-override' })` no
  `Models` criado pela sonda alcança o resolver. Isso verifica que ele funciona,
  não que a extensão possa aplicar esse override ao agente principal.
- Há assert de **bytes antes/depois** do auth em cada processo e no teste pai;
  o pai também verifica os bytes do bucket, IDs de processo distintos e caminhos
  idênticos. Não há prompt de modelo nem chamada HTTP.

A prova passa quando reproduz o **bloqueio**, não quando implementa contas v2.
Em outro build do Pi, rever também as interfaces públicas: o teste reproduz a precedência,
mas não enumera automaticamente novas APIs que possam desbloquear a implementação.
Ela não prova streaming Pi Black, refresh concorrente, rotação OAuth ou subagentes.
As funções de streaming nativas são preservadas, mas não executadas: não há motivo
para avançar ao transporte enquanto a seleção de credenciais já viola o requisito.
Não há aliases de provider, acesso privado, pasta/auth por conta ou `--api-key`
na invocação do CLI.

O ambiente dos filhos é construído por allowlist, com caminhos de usuário
sintéticos, descoberta de recursos desabilitada e `PI_OFFLINE=1` / telemetria
inativa. `offline-preload.mjs` bloqueia fetch e conexões HTTP/TCP/TLS antes do CLI.
Nenhum token real, instalação ou rede externa é necessário. O preload não é sandbox
do sistema operacional: não cobre HTTP/2, UDP ou subprocessos arbitrários; esses
caminhos não são usados pela sonda, que não envia prompt nem faz refresh remoto.

### Executar

Com dependências locais já instaladas, sem `pnpm exec` nem compilação do wrapper:

```bash
ORCA_BACKGROUND_LAUNCH=1 \
PI_ACCOUNTS_RUNTIME_DIR=/Users/biel/.local/share/pi-overlay/releases/0.87.1-f07218c4d4-e68205c8d3-d5be92cc15/lib/node_modules/@earendil-works/pi-coding-agent \
node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts \
  tests/tools/pi-accounts-session/pi-accounts-session.test.mjs \
  > /tmp/arca-accounts-v2-negative-test.log 2>&1 &
```

A sonda é opt-in: sem `PI_ACCOUNTS_RUNTIME_DIR`, fica ignorada na suíte comum,
que não depende de uma instalação local do Pi. Com a variável definida, um caminho
inválido falha; nenhum resultado ignorado conta como prova do bloqueio. Os diretórios
temporários são removidos ao terminar.

Verificação executada nesta revisão (macOS, runtime acima):

- Vitest: esta prova, `src/main/pi-accounts` e
  `src/shared/child-process/child-process-import-boundary.test.ts`, **10 arquivos /
  44 testes passaram**, em background com `ORCA_BACKGROUND_LAUNCH=1`.
- `node config/scripts/check-changed-code-quality.mjs HEAD`: zero achados novos
  nos três arquivos JavaScript, incluindo o gate type-aware.
- Oxlint direcionado, `oxfmt --check` e `git diff --check`: sem erros.
- `checks gate` solicitado, mas indisponível: o projeto não declara `.pi/checks.json`.
  Os resultados acima são dos comandos diretos, não de um gate comparativo configurado.
- Não executados: typecheck completo do app, Windows/Linux, streaming ou subagentes.

## Interfaces públicas e precedência

Referências abaixo são relativas ao pacote instalado; `pi-ai/` abrevia
`node_modules/@earendil-works/pi-ai/`. Foram lidos integralmente os documentos
`docs/{extensions,custom-provider,sdk,providers,models,environment-variables,configuration,cli}.md`,
as declarações de `ModelRegistry`, `ModelRuntime`, `Provider`, `Models` e auth,
e o exemplo `examples/sdk/09-api-keys-and-oauth.ts`.

| Superfície                                                  | Resultado                                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi.registerProvider(Provider)`                             | Público (`dist/core/extensions/types.d.ts:1141`). Substitui provider, não o store do agente.                                                                                                                   |
| `Provider.auth.apiKey.resolve`                              | `pi-ai/dist/auth/resolve.js:33–54`: override explícito primeiro; depois credencial armazenada; só sem credencial consulta ambient. OAuth armazenado sem handler retorna `undefined`, não fallback.             |
| `Provider.auth.oauth.refresh`                               | `pi-ai/dist/auth/resolve.js:68–113`: expiração global leva a `credentials.modify`; retorno do refresh é persistido antes de `toAuth`. `dist/core/auth-storage.js:378–391` serializa esse retorno em auth.json. |
| `oauth.toAuth`                                              | Contrato de derivação **sem efeitos colaterais** (`pi-ai/dist/auth/types.d.ts:197–220`). Não é hook de seleção/refresh anterior ao store; não evita refresh global expirado.                                   |
| `ctx.modelRegistry`                                         | `dist/core/extensions/types.d.ts:222` expõe `ModelRegistry`; `dist/core/model-registry.d.ts:20–47` declara `runtime` privado em TypeScript e não expõe setter de credencial.                                                  |
| `ModelRuntime.setRuntimeApiKey`                             | Existe para o **dono SDK**, não na fachada de extensão (`dist/core/model-runtime.d.ts:82`). Criar outro runtime não muda o agente em execução.                                                                 |
| `--api-key`                                                 | `dist/main.js:646–655` chama o setter no runtime do CLI. Exige controle do lançamento e modelo explícito. Não resolve a extensão carregada por `pi` normal fora do app, nem ambos os providers por si só.      |
| `modelRegistry.stream/streamSimple/complete(..., {apiKey})` | Override por chamada feita pela própria extensão; não configura os turnos, compactação ou chamadas internas do agente.                                                                                         |
| `before_provider_headers`, provider stream                  | Tarde demais: `dist/core/model-runtime.js:422–450` resolve auth antes de transformar headers/despachar stream. Não impede refresh/escrita global; também não serve para ausência de auth.                      |
| Registro legado `apiKey` / `oauth`                          | `dist/core/provider-composer.js:240–342` compõe handlers; não substitui o store nem sua precedência.                                                                                                           |

Os adapters de assinatura continuam os instalados:
`pi-ai/dist/api/anthropic-messages.js:721,773` usa `createClaudeCodeFetch` e o beta
OAuth; `pi-ai/dist/api/openai-codex-responses.js:169–180` deriva account ID do token
antes de montar headers. Trocar apenas Authorization não é substituto demonstrado
para selecionar a credencial que alimenta esses adapters.

### Contornos fora do contrato, não adotados

- `ctx.modelRegistry.runtime.setRuntimeApiKey` é alcançável em JavaScript: o campo
  é privado na declaração TypeScript, não um campo `#private`. Acesso direto depende
  de internals sem contrato para extensões. Não foi adotado nem testado como solução.
- `oauth.refresh` retornando `undefined` pode evitar gravação no store atual e deixar
  `toAuth` continuar com a credencial global expirada. Porém o retorno exigido é
  `Promise<OAuthCredential>` (`pi-ai/dist/auth/types.d.ts:213`); isso viola o contrato.
  Além disso, qualquer renovação/gravação do bucket dentro de `toAuth` contrariaria
  sua exigência de ausência de efeitos colaterais. A combinação também mantém locks
  do auth global e pode deixar status/UI refletindo a conta global.

A sonda não executa esses contornos. Ela comprova a precedência e a persistência
nos caminhos testados; a decisão de parar combina essa evidência com o requisito de
usar a API pública **sem violar seus tipos e sem efeitos colaterais não suportados**.

## Superfície mínima faltante

É necessário expor à **extensão da sessão normal**, antes da disponibilidade e da
resolução de auth, um override por provider que não leia/renove/persista o global.
A menor ponte para a hipótese `apiKey.resolve` seria disponibilizar publicamente
set/remove de runtime API key na fachada usada por extensões, com efeito na seleção
inicial e em todas as chamadas internas; o resolver então devolveria o OAuth do
bucket para os adapters nativos. Isso ainda exigiria prova de status de assinatura,
lifecycle/reload e refresh próprio, não conversão para cobrança por API.

Uma alternativa mais explícita seria um `CredentialStore` de sessão por provider,
com leitura/modificação dirigidas ao bucket e sem fallback global para conta fixa.
O SDK já permite fornecer store ao criar o runtime; a extensão não pode substituir
o store do runtime existente por API pública. Ambas as opções requerem mudança no
Pi e nova prova; nenhuma foi implementada aqui.

## Por que a prova cancelada não serve

1. Cada conta era copiada para um auth/pasta diferente. Isso testava isolamento de
   pastas e aceitava atualização de auth, contrariando as duas invariantes centrais.
2. O OAuth falso consultava o bucket como se fosse estado do servidor. Duas chamadas
   com o mesmo refresh antes da gravação podiam ser aceitas. Foi removido; **não há
   alegação de servidor de rotação corrigido**. Após desbloquear a API, a prova de
   rotação precisa de estado servidor independente, compartilhado entre processos,
   consumindo o token antes de responder/gravar o bucket.
3. Lock por conta envolvendo escrita do bucket inteiro permite perda de updates
   A/B. Foi removido; não é protocolo de produção. Uma prova futura precisa de lock
   de refresh por conta e transação global curta de releitura/merge/gravação do
   bucket, coordenada com todos os escritores existentes. Não carregar snapshot
   antes do lock global, nem roubar lock vivo por timeout fixo.
4. A extensão de seleção deve ser carregada nos subagentes. A spec registra que o
   runner ARCA usa `--no-extensions`; herdar env sozinho não basta. Essa integração
   e a prova de filhos ficam pendentes, não são substituídas por um launcher SDK.

SSH/WSL e workspaces de pasta não recebem implementação nesta etapa. Os dois cwd
sintéticos são pastas comuns, sem depender de git. Riscos adicionais de espelhamento,
locks incompatíveis e escritores antigos continuam os da spec. **Não adotar esta
sonda nem a prova cancelada como implementação de produção.**
