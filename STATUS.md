# STATUS — arca-desktop
> Última verificação: 2026-09-25 · Branch padrão: `arca-desktop` · Versão publicada: **1.5.8** (stable, Windows + Mac)

## Resumo
ARCA Desktop é um fork do Orca (MIT, stablyai/orca, base `dac82f61b`) mantido pela ARCA Tech:
IDE de desenvolvimento agêntico paralelo com marca/ícone/comando `arca` próprios, o Pi como
agente principal, painel Megamind (Mainframe), atualização por clique servida pelo Mainframe,
card de tarefas lido dos `STATUS.md`, sincronização automática dos projetos da ARCA e contas
Claude/Codex compartilhadas com o `/accounts` do Pi.

## Estado atual
- Distribuição: CI `.github/workflows/arca-desktop-build.yml` builda Windows x64 (NSIS por
  usuário) e macOS arm64 (ZIP) a cada push em `arca-desktop` e publica no canal `stable` do
  Mainframe (`/opt/arca/desktop-updates/stable`). Sem assinatura de código (Windows e Mac).
- Atualização: o app checa sozinho; baixa e instala só após clique ("Download and install" →
  "Restart"). E2E real no Mac comprovado (1.5.900 → 1.5.901). Doc:
  `docs/reference/arca-desktop-updates.md`; script: `config/scripts/arca-update-e2e-mac.mjs`.
- Projetos: clona os repos de `~/ARCA/arca/projects.json` que faltam (`%USERPROFILE%\ARCA` no
  Windows) e faz fetch + fast-forward seguro a cada 5 min e ao focar a janela; nunca
  stash/reset/rebase/force.
- Tarefas: card flutuante "Project tasks" (Este projeto / Recentes / Prioridades) lido dos
  `STATUS.md`; recolhido vira botão acima do floating workspace.
- Contas: seção "Contas do Pi" em Configurações troca a conta ativa do bucket
  `~/.pi/agent/accounts.json` (mesmo usado pelo `/accounts`), com lock compartilhado.
- Pi dentro do app: roda o `pi` do PATH e `~/.pi/agent` do usuário; subagentes com modelos
  diferentes testados (Claude + Codex em paralelo).

## Prioridade: estabilizar a 1.5.x para uso diário dos sócios
- [ ] Login, adição e remoção de contas Claude/Codex pela tela do app, usadas pelo Pi — Responsável: Gabriel Mendonça
- [ ] Notificações do macOS não aparecem (app sem assinatura completa; ARCA não entra em Ajustes › Notificações) — Responsável: Gabriel Mendonça
- [ ] Teste Windows real: atualização por clique, clone em `%USERPROFILE%\ARCA`, card de tarefas, Pi no PowerShell (`pi.cmd`), troca de contas nos dois sentidos — Responsável: Leonardo Vasconcelos de Campos · Ref: `docs/ARCA-TESTE-WINDOWS.md`

## Tarefas
### 🔴 Bloqueado
_Nenhuma._

### 🟡 Em andamento
- [ ] Login/adicionar/remover contas no app gravando no bucket do Pi (branch local `arca-acclogin`)
- [ ] Investigar notificações no macOS (registro no Notification Center exige identidade de bundle assinada)

### ⚪ A fazer (priorizado)
- [ ] Teste manual da troca de contas app ↔ `/accounts` no Mac (Gabriel) e no Windows (sócios)
- [ ] Esconder no onboarding/checklist os 3 cards de skills do Orca (orchestration, browser, computer use); deixar só "Instalar CLI" — duplicam `subagent`, `cua` e `arca-app` do Pi
- [ ] Mover o app do Gabriel de `dist/mac-arm64/ARCA.app` para `/Applications` (build local sobrescreve a cópia em uso)
- [ ] Botão de tarefas arrastável acompanhando o floating workspace (hoje fixo)
- [ ] Revisão B2/B3: remover estados mortos do updater herdado do Orca; reduzir processos git a cada gravação de `STATUS.md`
- [ ] Conta por aba/agente no Pi (hoje uma conta ativa por provedor por computador)
- [ ] Assinatura de código Windows (Authenticode) e Mac (Developer ID + notarização) — depende de certificado
- [ ] Reescrever `AGENTS.md` e este `STATUS.md` para que qualquer sócio edite sem contexto prévio

### ✅ Concluído recentemente (últimos ~30 dias)
- [x] 1.5.8: card de tarefas como botão flutuante; contas do Pi no app; correções da revisão de credenciais (lock `auth.json.lock`, refresh Codex nunca perdido, Keychain escopado, `CLAUDE_CONFIG_DIR`)
- [x] 1.5.7: atualização por clique; card de tarefas com STATUS.md; clone + sync automático dos projetos; correções Windows (`fs.watch` EPERM, `pi.cmd`); bloqueadores do `/skill:review`
- [x] E2E real de atualização no Mac (canal `e2e`, removido depois)
- [x] Skill `arca-app` no pacote do Pi (Pi dirige o app pelo CLI `arca`/`orca`)
- [x] Fork/rebrand ARCA Desktop a partir do Orca — `5f84c3fa`
- [x] Stats & Usage: tempo ativo por projeto — `ec6dbd7a`

## Observações / riscos
- Sem assinatura de código: SmartScreen avisa no Windows; no Mac o executável se identifica como
  "Electron", o que afeta notificações e permissões do sistema.
- SSH/WSL: extensões do app ainda são gravadas na pasta do Pi remoto; troca de conta nesses
  hosts é pelo `/accounts` do próprio host.
- Não rodar junto com o Orca original: ambos usam `%APPDATA%\orca` / `~/Library/Application Support/orca`.
- Testes de app sempre com `--user-data-dir` isolado; nunca apagar os dados reais do usuário.
