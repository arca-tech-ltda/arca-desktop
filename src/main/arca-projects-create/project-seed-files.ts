function today(now = new Date()): string {
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

export function arcaReadmeTemplate(title: string, description: string): string {
  return `# ${title}

${description.trim() || 'Projeto da ARCA.'}

## Como rodar

_A preencher._

## Estrutura

_A preencher._
`
}

/** Mirrors the STATUS.md shape the existing ARCA projects use (riva-radar-licitacoes). */
export function arcaStatusTemplate(title: string, description: string, now = new Date()): string {
  return `# STATUS — ${title}

Atualizado em ${today(now)}. Projeto recém-criado.

## O que o projeto faz

${description.trim() || '_A preencher._'}

## Verificado

- Repositório criado e registrado no catálogo da ARCA.

## Não verificado

- Tudo o mais.

## Limitações conhecidas

- _A preencher._

## Próximos passos

- _A preencher._
`
}

const GITIGNORE_LINES = [
  'node_modules/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  '.venv/',
  '__pycache__/',
  '*.log',
  '.env',
  '.env.local',
  '.DS_Store',
  'Thumbs.db'
]

export function arcaGitignoreTemplate(): string {
  return `${GITIGNORE_LINES.join('\n')}\n`
}
