import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import DesktopCompanion from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(): Promise<{ companion: DesktopCompanion; webServer: WebServer }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(DesktopCompanion)
  return {
    companion: ctx.get('desktopCompanion') as DesktopCompanion,
    webServer: ctx.get('webServer') as WebServer,
  }
}

describe('DesktopCompanion', () => {
  it('publishes one registered local companion descriptor', async () => {
    const { companion } = await harness()
    companion.register({
      id: 'pet',
      entryPath: '/__dsh/pet/overlay',
      width: 192,
      height: 208,
    })

    expect(companion.descriptor()).toEqual({
      id: 'pet',
      entryPath: '/__dsh/pet/overlay',
      width: 192,
      height: 208,
    })
  })

  it('rejects a second provider and releases the descriptor through its disposer', async () => {
    const { companion } = await harness()
    const dispose = companion.register({
      id: 'pet',
      entryPath: '/__dsh/pet/overlay',
      width: 192,
      height: 208,
    })

    expect(() => companion.register({
      id: 'another',
      entryPath: '/__dsh/another/overlay',
      width: 192,
      height: 208,
    })).toThrow('desktop companion is already registered')

    dispose()
    expect(companion.descriptor()).toBeUndefined()
  })

  it('rejects malformed descriptor paths and unsafe sizes at registration', async () => {
    const { companion } = await harness()

    expect(() => companion.register({
      id: 'pet',
      entryPath: 'https://example.test/pet',
      width: 192,
      height: 208,
    })).toThrow('desktop companion entryPath must be an origin-relative pathname')
    expect(() => companion.register({
      id: 'pet',
      entryPath: '/__dsh/pet/overlay',
      width: 0,
      height: 208,
    })).toThrow('desktop companion width must be between 64 and 512')
  })

  it('validates generic capabilities and keeps a registered descriptor immutable', async () => {
    const { companion } = await harness()
    const descriptor = {
      id: 'pet',
      entryPath: '/__dsh/pet/overlay',
      width: 192,
      height: 208,
      capabilities: {
        drag: true,
        pointerInteraction: true,
        resize: { minWidth: 128, maxWidth: 256, minHeight: 128, maxHeight: 256 },
      },
    } as const
    companion.register(descriptor)

    expect(companion.descriptor()).toEqual(descriptor)
    expect(() => companion.register({
      id: 'other', entryPath: '/other', width: 192, height: 208,
      capabilities: { resize: { minWidth: 256, maxWidth: 128, minHeight: 128, maxHeight: 256 } },
    })).toThrow('desktop companion resize width range is reversed')

    const current = companion.descriptor()!
    expect(Object.isFrozen(current.capabilities)).toBe(true)
    expect(Object.isFrozen(current.capabilities?.resize)).toBe(true)
  })

  it('rejects non-finite and out-of-range capability dimensions', async () => {
    const { companion } = await harness()
    const base = { id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208 }
    expect(() => companion.register({ ...base, capabilities: {
      resize: { minWidth: Number.NaN, maxWidth: 256, minHeight: 128, maxHeight: 256 },
    } })).toThrow('desktop companion resize minWidth must be between 64 and 512')
    expect(() => companion.register({ ...base, capabilities: {
      resize: { minWidth: 32, maxWidth: 256, minHeight: 128, maxHeight: 256 },
    } })).toThrow('desktop companion resize minWidth must be between 64 and 512')
    expect(() => companion.register({ ...base, capabilities: {
      resize: { minWidth: 128, maxWidth: 256, minHeight: 256, maxHeight: 128 },
    } })).toThrow('desktop companion resize height range is reversed')
  })

  it('answers discovery with 204 until a descriptor registers, then JSON without cache', async () => {
    const { companion, webServer } = await harness()
    const url = `http://127.0.0.1:${webServer.port}/__dsh/desktop/companion`

    expect((await fetch(url)).status).toBe(204)
    companion.register({ id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208 })
    const response = await fetch(url)

    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      id: 'pet', entryPath: '/__dsh/pet/overlay', width: 192, height: 208,
    })
  })
})
