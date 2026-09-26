import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export default async function accountSessionExtension(pi) {
  const env = process.env
  const account = env.PI_ACCOUNTS_ACCOUNT
  const agentDir = env.PI_CODING_AGENT_DIR
  const reportDir = env.PI_ACCOUNTS_REPORT_DIR
  const aiDir = join(env.PI_ACCOUNTS_RUNTIME_DIR, 'node_modules', '@earendil-works', 'pi-ai')
  const { createModels } = await import(pathToFileURL(join(aiDir, 'dist', 'index.js')).href)
  const { anthropicProvider } = await import(
    pathToFileURL(join(aiDir, 'dist', 'providers', 'anthropic.js')).href
  )
  const { openaiCodexProvider } = await import(
    pathToFileURL(join(aiDir, 'dist', 'providers', 'openai-codex.js')).href
  )
  const bucket = JSON.parse(await readFile(join(agentDir, 'accounts.json'), 'utf8'))
  const authPath = join(agentDir, 'auth.json')
  const before = await readFile(authPath)
  const globals = JSON.parse(before.toString())
  const probes = [anthropicProvider(), openaiCodexProvider()].map((native) => {
    let resolverCalls = 0
    const selected = bucket.accounts[native.id][account]
    const apiKey = {
      name: 'Synthetic bucket selection',
      resolve: async () => {
        resolverCalls++
        return { auth: await native.auth.oauth.toAuth(selected), source: 'bucket' }
      }
    }
    const provider = { ...native, auth: { ...native.auth, apiKey } }
    pi.registerProvider(provider)
    return { native, provider, selected, calls: () => resolverCalls }
  })

  pi.on('session_start', async (_event, context) => {
    await writeFile(join(reportDir, `${account}.ready`), String(process.pid))
    const deadline = Date.now() + 15_000
    for (const peer of ['A', 'B']) {
      while (!(await readFile(join(reportDir, `${peer}.ready`)).catch(() => undefined))) {
        assert.ok(Date.now() < deadline, 'both CLI processes must reach session_start')
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }
    const results = []
    for (const { native, provider, selected, calls } of probes) {
      const globalCredential = globals[native.id]
      const globalAuth = await native.auth.oauth.toAuth(globalCredential)
      const selectedAuth = await native.auth.oauth.toAuth(selected)
      const resolved = await context.modelRegistry.getProviderAuth(native.id)
      assert.deepEqual(resolved.auth, globalAuth)
      assert.notDeepEqual(resolved.auth, selectedAuth)
      assert.equal(calls(), 0)

      const bucketOnly = { ...provider, auth: { apiKey: provider.auth.apiKey } }
      pi.registerProvider(bucketOnly)
      assert.equal(await context.modelRegistry.getProviderAuth(native.id), undefined)
      assert.equal(calls(), 0)

      // Record the canonical store mutation without ever writing auth.json.
      let current = { ...globalCredential, expires: 0 }
      const writes = []
      let refreshInput
      const credentials = {
        read: async () => current,
        list: async () => [{ providerId: native.id, type: 'oauth' }],
        delete: async () => {
          throw new Error('unexpected delete')
        },
        modify: async (id, update) => {
          assert.equal(id, native.id)
          const next = await update(current)
          if (next !== undefined) {
            writes.push(next)
            current = next
          }
          return current
        }
      }
      const models = createModels({
        credentials,
        authContext: { env: async () => undefined, fileExists: async () => false }
      })
      models.setProvider({
        ...provider,
        auth: {
          ...provider.auth,
          oauth: {
            ...native.auth.oauth,
            refresh: async (credential) => {
              refreshInput = credential
              return selected
            }
          }
        }
      })
      assert.deepEqual((await models.getAuth(native.id)).auth, selectedAuth)
      assert.deepEqual(refreshInput, { ...globalCredential, expires: 0 })
      assert.deepEqual(writes, [selected])
      assert.equal(calls(), 0)

      models.setProvider(bucketOnly)
      assert.equal(await models.getAuth(native.id), undefined)
      const explicit = await models.getAuth(native.id, { apiKey: 'synthetic-runtime-override' })
      assert.deepEqual(explicit.auth, selectedAuth)
      assert.equal(calls(), 1)
      results.push({
        provider: native.id,
        freshGlobalWins: true,
        withoutOAuthUnconfigured: true,
        refreshWritesSelectedToGlobalStore: true,
        explicitOverrideWorksForDirectCallerOnly: true
      })
    }
    assert.deepEqual(await readFile(authPath), before)
    await writeFile(
      join(reportDir, `${account}.json`),
      JSON.stringify({
        account,
        pid: process.pid,
        agentDir,
        authPath,
        results
      })
    )
  })
}
