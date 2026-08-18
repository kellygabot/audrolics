import { beforeEach, describe, expect, it } from 'vitest'
import {
    clearLocalSchematicLibrary,
    deleteSchematic,
    listSchematics,
    loadSchematic,
    saveSchematic,
} from '@/lib/builder-storage'

describe('builder local storage adapter', () => {
    beforeEach(() => {
        if (!window.localStorage) {
            const store = new Map<string, string>()
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                value: {
                    clear: () => store.clear(),
                    getItem: (key: string) => store.get(key) ?? null,
                    removeItem: (key: string) => store.delete(key),
                    setItem: (key: string, value: string) => store.set(key, value),
                },
            })
        }
        window.localStorage.clear()
    })

    it('saves, lists, loads, and deletes a schematic', async () => {
        const saved = await saveSchematic('engineer-a', {
            name: 'Pump station segment',
            nodes: [],
            links: [],
        })

        expect(saved.id).toMatch(/^local-/)
        expect(await listSchematics('engineer-a')).toEqual([
            { id: saved.id, name: 'Pump station segment', updated_at: saved.updated_at },
        ])
        expect(await loadSchematic('engineer-a', saved.id)).toMatchObject({ id: saved.id, name: 'Pump station segment' })
        expect(await deleteSchematic('engineer-a', saved.id)).toBe(true)
        expect(await listSchematics('engineer-a')).toEqual([])
    })

    it('keeps schematic libraries scoped by user id', async () => {
        const saved = await saveSchematic('engineer-a', { name: 'A', nodes: [], links: [] })
        await saveSchematic('engineer-b', { name: 'B', nodes: [], links: [] })

        expect(await loadSchematic('engineer-b', saved.id)).toBeNull()
        expect(await listSchematics('engineer-a')).toHaveLength(1)
        expect(await listSchematics('engineer-b')).toHaveLength(1)
    })

    it('can clear one local user library', async () => {
        await saveSchematic('engineer-a', { name: 'A', nodes: [], links: [] })
        await saveSchematic('engineer-b', { name: 'B', nodes: [], links: [] })

        clearLocalSchematicLibrary('engineer-a')

        expect(await listSchematics('engineer-a')).toEqual([])
        expect(await listSchematics('engineer-b')).toHaveLength(1)
    })
})
