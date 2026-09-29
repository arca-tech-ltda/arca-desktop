import { expect, it } from 'vitest'
import {
  addProjectToCatalogJson,
  catalogProjectIds,
  updateWorkspaceTestIds
} from './catalog-file-edit'

const catalog = JSON.stringify(
  {
    version: 1,
    root_default: '~/ARCA',
    projects: [
      {
        id: 'isaro',
        title: 'Isaro',
        repos: [{ url: 'https://github.com/arca-tech-ltda/isaro.git', path: 'clientes/isaro' }]
      }
    ]
  },
  null,
  2
)

it('appends the project and keeps the file shape', () => {
  const updated = addProjectToCatalogJson(catalog, {
    id: 'radar',
    title: 'Radar',
    type: 'clientes',
    name: 'radar'
  })
  expect(updated.endsWith('\n')).toBe(true)
  expect(updated).toContain('  "version": 1')
  const parsed: { version: number; projects: { id: string; repos: unknown[] }[] } =
    JSON.parse(updated)
  expect(parsed.version).toBe(1)
  expect(parsed.projects.at(-1)).toEqual({
    id: 'radar',
    title: 'Radar',
    repos: [{ url: 'https://github.com/arca-tech-ltda/radar.git', path: 'clientes/radar' }]
  })
})

it('refuses a duplicate id instead of shadowing the existing project', () => {
  expect(() =>
    addProjectToCatalogJson(catalog, {
      id: 'isaro',
      title: 'Isaro',
      type: 'clientes',
      name: 'isaro'
    })
  ).toThrow(/already has the id/)
})

it('rewrites the id list pinned by arca_workspace.test.ts', () => {
  const source = [
    'const ids = real.projects.map((p: any) => p.id).sort();',
    'assert.deepEqual(ids, ["arca", "isaro"]);',
    'assert.ok(!ids.includes("brain"), "brain é legado");'
  ].join('\n')
  const updated = updateWorkspaceTestIds(source, catalogProjectIds(catalog).concat('radar').sort())
  expect(updated).toContain('assert.deepEqual(ids, ["isaro", "radar"]);')
  expect(updated).toContain('assert.ok(!ids.includes("brain")')
})

it('fails loudly when the assertion moved', () => {
  expect(() => updateWorkspaceTestIds('const ids = [];', ['a'])).toThrow(/assertion/)
})
