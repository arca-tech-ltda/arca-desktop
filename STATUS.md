# STATUS — arca-desktop
> Última verificação: 2026-09-26 · Branch padrão: `arca-desktop` · Versão publicada: **1.5.10** (stable, Windows + Mac)

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
- Contas: seção "Contas do Pi" em Configurações adiciona (login Claude/Codex pelo app),
  usa, renomeia e remove contas do bucket `~/.pi/agent/accounts.json` (o mesmo do
  `/accounts`), com lock compartilhado `auth.json.lock`. Próximo passo planejado em
  `docs/reference/arca-accounts-v2.md`.
- Terminal: tema escuro padrão "ARCA Black" (fundo `#000000`).
- Pi dentro do app: roda o `pi` do PATH e `~/.pi/agent` do usuário; subagentes com modelos
  diferentes testados (Claude + Codex em paralelo).

## Prioridade: contas v2 (conta por projeto, uso/cota, quem está usando) — 1.6.0
Plano completo, restrições e verificação: `docs/reference/arca-accounts-v2.md`.
- [ ] 1. **BLOQUEADO na API pública do Pi:** prova negativa com dois CLIs e auth compartilhado reproduz a precedência do OAuth global (Claude/Codex). Autorizar ponte de credenciais em cópia isolada do runtime antes da prova de isolamento/refresh/subagentes — Responsável: Gabriel Mendonça
- [ ] 2. Mapeamento projeto → conta no bucket (leitura compatível v1/v2 no app e no core do `arca`) e resolução cwd → projeto pelo `projects.json` — Responsável: Gabriel Mendonça
- [ ] 3. Configurar a conta do projeto no menu "⋯" da barra lateral (submenu Conta), selo ao lado do nome, Project Settings, tela de contas e `/accounts project` — Responsável: Gabriel Mendonça
- [ ] 4. Redesenhar a tela de contas: card por provedor ("Claude"/"Codex"), conta com e-mail e selo Ativa, ações em "⋯", "Adicionar conta" em destaque, detalhes técnicos recolhidos, Megamind/Gemini/OpenCode separados — Responsável: Gabriel Mendonça
- [ ] 5. Uso e cota por conta (ativas e inativas): barras 5 h/semanal, gráfico 24 h/7 dias com histórico local, refresh de inativas gravando no bucket sob lock — Responsável: Gabriel Mendonça
- [ ] 6. Quem está usando cada conta via presença do Megamind (só nome/e-mail/projeto, nunca token) e alerta de cota compartilhada — depende de mudança no Mainframe — Responsável: Gabriel Mendonça

## Tarefas
### 🔴 Bloqueado
- [ ] Contas v2, etapa 1: a extensão não pode substituir a origem da credencial da sessão normal sem alterar o Pi. [Evidências e comando](tests/tools/pi-accounts-session/README.md). Worktree `/tmp/arca-accounts-v2-wt`, branch `arca-accounts-v2`; etapas 2–6 não iniciadas.

### 🟡 Em andamento
- [ ] Teste manual do login de conta pelo app (Claude e Codex, Mac e Windows) — código na 1.5.9
- [ ] Notificações no macOS: selar a assinatura ad-hoc do bundle com o id `br.com.arcatech.arca-desktop` no build (worktree `/tmp/arca-notif-wt`, branch `arca-notif`)
- [ ] Onboarding só "Install CLI" (sem as 3 skills do Orca) + botão de tarefas acompanhando o floating workspace (worktree `/tmp/arca-ui-wt`, branch `arca-ui`)
- [ ] Limpeza B2 (estados mortos do updater herdado) e B3 (debounce/cache do git blame do STATUS.md) (worktree `/tmp/arca-cleanup-wt`, branch `arca-cleanup`)

### ⚪ A fazer (priorizado)
- [ ] Gabriel: fechar o ARCA, abrir por `/Applications/ARCA.app` (cópia já feita), atualizar para 1.5.10 e apagar `dist/mac-arm64/ARCA.app`
- [ ] Teste manual da troca de contas app ↔ `/accounts` no Mac (Gabriel) e no Windows (sócios)
- [ ] Assinatura de código Windows (Authenticode) e Mac (Developer ID + notarização) — depende de certificado
- [ ] Reescrever `AGENTS.md` e este `STATUS.md` para que qualquer sócio edite sem contexto prévio

### ✅ Concluído recentemente (últimos ~30 dias)
- [x] 1.5.10: tema de terminal "ARCA Black" (fundo preto) como padrão escuro, com migração única; login de contas passando pelo wrapper de processos
- [x] 1.5.9: adicionar/renomear/remover contas pelo app (login Claude/Codex) gravando no bucket do Pi; logo ao lado do nome no titlebar do Mac
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
