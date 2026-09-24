# Atualizações do ARCA Desktop

## Feed e credenciais

O Desktop usa por padrão o canal `stable` do provider generic em
`${ARCA_MAINFRAME_URL}/api/arca/desktop/updates/stable/`. O default é
`https://mainframe.arcatech.com.br`. A credencial é lida pelo serviço Megamind de
`~/.config/arca-projects/config.json` e seu `token_file`, sem copiar o token para
preferências ou renderer. A origem da credencial precisa coincidir com a do feed.
Token ausente/inválido mantém as requisições inativas e pede conexão ao Megamind.
Cada checagem relê a credencial, permitindo conectar ou rotacionar sem reiniciar.

No Windows, a primeira checagem ocorre imediatamente quando não há histórico recente; no macOS,
após 30 segundos. As seguintes ocorrem a cada quatro horas.
O download exige clique; os controles existentes mostram o progresso e
“Restart to update” exige confirmação separada. Modificadores de teclado, listas de builds e nudges upstream
não selecionam GitHub, RC ou canais de desenvolvimento. Builds de desenvolvimento
não consultam o feed. O contrato atual não distribui Linux.

## Windows

O NSIS reutiliza `electron-updater`, incluindo SHA512, download em background,
instalação explícita e instalação ao sair. `win.verifyUpdateCodeSignature: false`
é intencional para esta distribuição sem assinatura (também era passado pela CI).
Não há override em runtime que simule uma assinatura válida. Instalações antigas
que exigiam assinatura precisam receber esta versão por instalação manual.

## macOS sem assinatura Apple

Squirrel.Mac não é usado. O Desktop lê `latest-mac.yml`, escolhe o ZIP da arquitetura
em execução, baixa com Bearer (sem redirects), verifica SHA512 e extrai com `ditto`
em diretório temporário privado. Os nomes publicados incluem versão e arquitetura.

“Restart to update” executa um script destacado que espera até 120 segundos pelo
PID antigo. Só então ele move o bundle para `<app>.app.bak`, copia o novo com
`ditto`, remove `com.apple.quarantine` e relança sem ativação de foco (`open -g`).
Falha de cópia, remoção de quarentena ou relançamento restaura o backup. O backup
anterior é substituído no próximo update; o mais recente permanece para recuperação.

Limitações:

- O bundle e seu diretório pai precisam ser graváveis; não há sudo nem elevação.
  App Translocation, DMG montado e instalações administradas podem impedir a troca.
- Nesses casos a UI oferece o link do DMG no feed. O endpoint exige Bearer de
  dispositivo: abrir esse link em um navegador comum **não autentica o download**.
  Distribuição manual autenticada deve ser feita pelo operador até o Mainframe
  oferecer uma página de download para o sócio.
- A CI atual publica somente arm64 no macOS e x64 no Windows. Macs Intel não
  recebem um ZIP incompatível; precisam de um build próprio.
- O macOS instala pelo botão explícito; sair normalmente antes disso não aplica
  o ZIP. O staging não persiste no estado do updater entre processos; um próximo
  início pode baixar novamente. Diretórios `arca-update-*`/`arca-install-*` em temp
  ficam disponíveis para diagnóstico e podem ser removidos com o app fechado.
- SHA512 protege integridade, não autoria. HTTPS, token de dispositivo e segredo
  de publicação são a fronteira de confiança; não há notarização/assinatura Apple.
- Rollback cobre falhas dos comandos, não falta de energia, SIGKILL ou crash do
  novo app depois que `open` aceitou o lançamento. Nesse caso restaure `.app.bak`.
- Não há auto-instalação macOS em servidor headless. A atualização é da máquina
  que executa o Desktop, não do host SSH nem dos projetos/worktrees/pastas.
  O callback de encerramento existente é preservado; nenhuma sessão remota é morta
  ou declarada encerrada por este updater.

## CI e produção

`.github/workflows/arca-desktop-build.yml` injeta `ARCA_RELEASE_VERSION=1.5.<run_number>`;
`extraMetadata.version` tem precedência sobre versões locais/dev. Artefatos têm nomes
versionados, e electron-builder gera `latest.yml`/`latest-mac.yml` com provider generic,
sempre com `--publish never`.

O job `publish` aguarda Windows e macOS, só publica em push na branch `arca-desktop`,
e faz PUT com retries, binários/blockmaps antes dos manifests. Sem o secret
`ARCA_DESKTOP_PUBLISH_TOKEN`, apenas avisa e pula. Execuções desse workflow são
serializadas sem cancelar uma publicação em andamento. Não republicar runs antigos
sobre um feed mais novo; `run_number` não muda em reruns.

Para ativar em produção:

1. Deploy da branch `arca-desktop-integracoes` do Mainframe, volume persistente,
   `ARCA_DESKTOP_UPDATES_DIR`, segredo de publicação e proxy conforme
   `docs/DEPLOY-desktop-updates.md` daquele repositório.
2. Adicionar o mesmo segredo como `ARCA_DESKTOP_PUBLISH_TOKEN` no GitHub.
3. Publicar uma versão e validar GET autenticado, ausência de auth, Range, hashes,
   download/instalação reais em Windows e macOS (incluindo rollback e local sem escrita).
4. Validar os textos nos seis catálogos de localização.

Os testes locais não substituem empacotamento/instalação reais. Nenhum deploy,
publicação, app visível ou substituição de bundle foi executado nesta implementação.

## Fluxo controlado pelo usuário e E2E (2026-05)

Checar não autoriza baixar. Windows usa `autoDownload=false`; macOS consulta apenas
`latest-mac.yml` até o clique. Status bar e badge de Settings indicam a oferta;
Settings → Updates mantém versão atual, nova e data do manifesto. O card upstream
oferece download, progresso (% e MB), cancelamento, erros/retry e confirmação
separada para reiniciar. “Depois” minimiza o card, sem reiniciar automaticamente.
O menu nativo troca “Check for Updates…” por “Restart to Update” quando pronto.

Windows: `autoInstallOnAppQuit=true` apenas no modo interativo. NSIS permanece por
usuário (`perMachine=false`), e o clique usa `quitAndInstall(true, true)` (silencioso,
relança), sem pedir UAC. Não converte instalações antigas por máquina em instalações
por usuário. macOS continua instalando apenas no clique, não no encerramento normal.
Isso não altera processos ou status de hosts SSH, worktrees ou pastas.

`ARCA_UPDATE_CHANNEL` é um override de teste: aceita somente `[a-z0-9-]{1,32}`;
ausente significa `stable`. Valores inválidos desativam a leitura do feed. A origem,
HTTPS e Bearer do device continuam obrigatórios; não aceita URL arbitrária no canal.

No macOS arm64, com dependências de build instaladas:

```sh
# Builda uma vez, empacota 1.5.900 e 1.5.901, publica SOMENTE e2e e extrai a antiga.
ARCA_DESKTOP_PUBLISH_TOKEN=... node config/scripts/arca-update-e2e-mac.mjs --publish
```

Sem `--publish`, prepara os mesmos artefatos sem upload. O script recusa substituir
`/tmp/arca-e2e/Applications/ARCA.app` existente. Reexecução exige mover esse bundle
antes. Publica ZIP/blockmap antes de `latest-mac.yml`; o builder gera SHA512.
Nunca muda o feed stable, a versão do package.json ou o perfil normal do Desktop.
Não executar duas publicações e2e simultaneamente.

O script imprime o comando com `ORCA_BACKGROUND_LAUNCH=1`, `ARCA_UPDATE_CHANNEL=e2e`,
`--user-data-dir=/tmp/arca-e2e/ud` e CDP na porta 9339. O device deve estar matriculado
no mesmo Mainframe. Para prova, conectar Playwright CDP ao renderer oculto, checar
1.5.900, esperar oferta 1.5.901 e confirmar ausência de GET do ZIP antes do clique.
Usar `data-testid=update-available-version`, `update-download`, `update-restart`;
verificar progresso, cancelar/repetir, aguardar pronto sem restart automático,
reiniciar explicitamente e reconectar para confirmar 1.5.901. Screenshots via CDP,
nunca revelar janela. O instalador preserva os argumentos de perfil/CDP e, no modo
background, herda o ambiente sem usar Launch Services para não perder essa política.

Publicação, execução do app e troca real do bundle não foram realizadas neste trabalho;
a prova instalada fica para o orquestrador com credenciais. Testes unitários não a
substituem. Os seis catálogos incluem os novos textos; não há catálogo pt no projeto.
