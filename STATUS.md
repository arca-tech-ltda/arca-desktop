# STATUS — arca-desktop
> Última verificação: 2026-09-24 · Branch padrão: `arca-desktop` · Último commit: `ec6dbd7a` 2026-09-23 (Gabriel Mendonça)

## Resumo
ARCA Desktop é um fork do Orca (MIT, stablyai/orca) mantido pela ARCA Tech: mesma IDE de
desenvolvimento agêntico paralelo, com marca/ícone/comando `arca` próprios, atualização
automática do upstream desligada, painel Megamind (Mainframe) e o Pi carregado via
`--extension`. O histórico deste repositório foi importado como um único commit de fork
(`5f84c3fa`, baseado no commit `dac82f61b` do Orca) seguido de apenas 2 commits próprios da
ARCA até agora — o projeto está em fase inicial de adaptação/teste, não de feature work amplo.

## Estado atual
- Build/CI: workflow único `.github/workflows/arca-desktop-build.yml` ("ARCA Desktop Build"),
  roda em push para `arca-desktop` ou manualmente. Os 3 commits existentes têm build verde
  (Windows x64 NSIS + macOS arm64 DMG/ZIP, ambos sem assinatura de código). Último run:
  `35912674158`, sucesso, ~10min (2026-09-23).
- Deploy/produção: não identificado. É um app desktop distribuído como artefato de CI
  (retenção de 14 dias), sem release publicado (`gh release list` vazio) e sem GitHub Pages
  (API retorna 404). O diretório `cloud/` (push/relay/relay-fence-broker) é infraestrutura
  herdada do Orca upstream, sem evidência de que a ARCA a tenha implantado ou modificado.
- Branches abertas / PRs: nenhuma. Só existe `origin/arca-desktop`; `gh pr list --state all` e
  `gh issue list --state all` não retornaram nada.

## Tarefas
### 🔴 Bloqueado
_Nenhuma._

### 🟡 Em andamento
_Nenhuma._

### ⚪ A fazer (priorizado)
- [ ] Teste manual do build Windows (instalação, Pi via `--extension`, painel Megamind:
      presença, `megamind_request`, fluxo de aprovação) — Responsável: Leonardo Vasconcelos de
      Campos · Ref: `docs/ARCA-TESTE-WINDOWS.md`

### ✅ Concluído recentemente (últimos ~30 dias)
- [x] Fork/rebrand ARCA Desktop 1.4.197 a partir do Orca (marca, ícone, CLI `arca`, Pi via
      `--extension`, painel Megamind, auto-update do upstream desligado, CI de build Windows
      x64/macOS sem assinatura) — `5f84c3fa`
- [x] Checklist de teste Windows atualizado com nome real do instalador e limitações
      conhecidas — `341a6a92`
- [x] Stats & Usage: tempo ativo por projeto (local), views Hoje/7 dias — `ec6dbd7a`

## Observações / riscos
- Build sem assinatura de código: Windows SmartScreen avisa o usuário; não há atualização
  automática (decisão de projeto, não pendência) — cada nova versão exige baixar e instalar de
  novo.
- Limitação conhecida (documentada em `docs/ARCA-TESTE-WINDOWS.md`): projetos via SSH/WSL ainda
  gravam as extensões do app na pasta do Pi remoto; recomenda-se usar pastas locais até isso ser
  corrigido.
- Não rodar junto com uma instalação do Orca original: ambos usam a mesma pasta de dados
  (`%APPDATA%\orca`).
- Este STATUS.md é o primeiro para o repositório (não havia um anterior para comparar).
- Build/testes completos não foram executados nesta verificação: é um monorepo Electron grande
  com módulos nativos, `pnpm install` e build levariam bem mais que alguns minutos — não foi
  tentado. A evidência de que o build funciona vem dos runs de CI já verdes (ver acima).
