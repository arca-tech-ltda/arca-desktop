# ARCA Desktop — teste no Windows (Leo)

Build sem assinatura: o Windows SmartScreen vai avisar. Clique em **Mais informações → Executar assim mesmo**.

## Pré-requisitos (já devem existir)

```powershell
node -v; git --version; pi --version
Test-Path $env:USERPROFILE\.config\arca-projects\config.json   # enrollment do Megamind
Test-Path $env:USERPROFILE\ARCA\arca                          # workspace ARCA
```

Se faltar algo, siga `~/ARCA/arca/INSTALAR.md` antes (install.ps1 e enrollment).

## 1. Instalar

1. Baixe o artefato `arca-desktop-windows-x64` do workflow **ARCA Desktop Build** em
   `github.com/arca-tech-ltda/arca-desktop/actions`.
2. Descompacte e rode o instalador `ARCA-*-setup*.exe`.
3. Abra **ARCA** pelo Menu Iniciar.

## 2. Pi da ARCA num projeto

1. **Add repository** → escolha uma pasta em `%USERPROFILE%\ARCA\clientes\` (ex. `marqserv`).
2. Crie um workspace/worktree e inicie o agente **Pi**.
3. Confira:
   - o Pi abre com o tema, as skills e as ferramentas da ARCA (`/megamind` responde);
   - o título/status da aba do app acompanha o Pi (extensões do app carregadas via `--extension`);
   - `%USERPROFILE%\.pi\agent\settings.json` e `%USERPROFILE%\.pi\agent\extensions\` **não mudaram**
     (`git -C $env:USERPROFILE\ARCA\arca status` limpo).

## 3. Megamind

1. Abra o painel **Megamind** (ícone de rádio na barra lateral direita ou **View → Megamind**).
2. Faça login com o código enviado ao seu e-mail.
3. Confira que sua sessão Pi aparece em presença, com projeto e branch.
4. Peça ao Gabriel para enviar um `megamind_request` para sua sessão; aceite e conclua pelo Pi.
5. Com um pedido em atendimento, provoque uma aprovação (ex. `git push` num branch de teste) e
   aprove/negue pelo painel. O Pi deve receber a decisão.

## O que reportar

- Versão (Help → About), prints de qualquer erro, e o resultado de cada passo (ok/falhou).
- Logs: `%APPDATA%\ARCA\logs`.

## Limitações conhecidas

- Sem assinatura de código e sem atualização automática.
- Projetos via SSH/WSL ainda gravam as extensões do app na pasta do Pi remoto; use pastas locais.
