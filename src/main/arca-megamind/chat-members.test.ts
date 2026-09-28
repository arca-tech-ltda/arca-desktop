import { expect, it, vi } from 'vitest'
import { fetchMegamindMembers, isDesktopSession } from './chat-members'

const now = Date.parse('2026-01-01T00:02:00Z')
const seen = (secondsAgo: number): string => new Date(now - secondsAgo * 1000).toISOString()

it('reads people from chat_members when the server has it', async () => {
  const tool = vi.fn().mockResolvedValue({
    items: [
      {
        handle: 'enzo',
        name: 'enzo-raw',
        online: true,
        app_online: false,
        sessions: [
          { session_id: 'b1c2', label: 'Sessão', project: 'pi', harness: 'pi', last_seen: seen(10) }
        ]
      }
    ]
  })
  await expect(fetchMegamindMembers(tool, now)).resolves.toEqual({
    degraded: false,
    items: [
      {
        handle: 'enzo',
        name: 'enzo-raw',
        online: true,
        appOnline: false,
        sessions: [
          {
            sessionId: 'b1c2',
            label: 'Sessão',
            project: 'pi',
            harness: 'pi',
            note: '',
            lastSeen: seen(10),
            status: 'active'
          }
        ]
      }
    ]
  })
  expect(tool).toHaveBeenCalledWith('chat_members', {})
})

it('falls back to list_agents on a server without the tool and marks the answer degraded', async () => {
  const tool = vi.fn().mockImplementation(async (name: string) => {
    if (name === 'chat_members') {
      throw new Error('Megamind tool failed')
    }
    return {
      items: [
        { owner_name: 'biel', session_id: 'a1', harness: 'desktop', last_seen: seen(5) },
        { owner_name: 'biel', session_id: 'a2', harness: 'pi', last_seen: seen(600) },
        { owner_name: 'enzo', session_id: 'b1', harness: 'codex', last_seen: seen(30) }
      ]
    }
  })
  const members = await fetchMegamindMembers(tool, now)
  expect(members.degraded).toBe(true)
  expect(members.items).toEqual([
    expect.objectContaining({ handle: 'biel', online: false, appOnline: true }),
    expect.objectContaining({ handle: 'enzo', online: true, appOnline: false })
  ])
  expect(members.items[0].sessions).toHaveLength(2)
})

it('recognises the desktop presence in both the v5.1 and the pre-5.1 shape', () => {
  expect(isDesktopSession({ harness: 'desktop', note: '' })).toBe(true)
  expect(isDesktopSession({ harness: 'pi', note: 'Desktop inbox; no agent execution' })).toBe(true)
  expect(isDesktopSession({ harness: 'pi', note: 'trabalhando' })).toBe(false)
})

it('keeps the idle status the server reports and infers it on a server that omits it', async () => {
  const chatMembers = vi.fn().mockResolvedValue({
    items: [
      {
        handle: 'enzo',
        name: 'enzo-raw',
        online: true,
        app_online: false,
        sessions: [
          {
            session_id: 'b1c2',
            harness: 'pi',
            last_seen: seen(300),
            idle: true,
            status: 'idle'
          }
        ]
      }
    ]
  })
  const members = await fetchMegamindMembers(chatMembers, now)
  expect(members.items[0].sessions[0].status).toBe('idle')

  // A server that predates the field says nothing: the age decides, as it always did.
  const older = vi.fn().mockImplementation(async (name: string) => {
    if (name === 'chat_members') {
      throw new Error('Megamind tool failed')
    }
    return {
      items: [
        { owner_name: 'enzo', session_id: 'b1', harness: 'pi', last_seen: seen(30) },
        { owner_name: 'enzo', session_id: 'b2', harness: 'pi', last_seen: seen(600) }
      ]
    }
  })
  const legacy = await fetchMegamindMembers(older, now)
  expect(legacy.items[0].sessions.map((session) => session.status)).toEqual(['active', 'recent'])
  expect(legacy.items[0].online).toBe(true)
})
