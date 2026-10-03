import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BuilderPage } from '@/app/builder/page'

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    })

describe('BuilderPage', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    beforeEach(() => {
        HTMLElement.prototype.setPointerCapture ??= () => undefined
        HTMLElement.prototype.releasePointerCapture ??= () => undefined
        SVGElement.prototype.setPointerCapture ??= () => undefined
        SVGElement.prototype.releasePointerCapture ??= () => undefined

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
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    })

    it('renders the builder shell', () => {
        render(<BuilderPage />)
        expect(screen.getByRole('textbox', { name: /schematic name/i })
        ).toHaveValue('Untitled schematic')

        expect(screen.getByRole('application', { name: /schematic builder canvas/i })
        ).toBeInTheDocument()

        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
        expect(screen.getByLabelText(/line color/i)).toBeInTheDocument()
        expect(screen.getByText(/strainer settings/i)).toBeInTheDocument()
    })

    it('creates pipes with hydraulic defaults', () => {
        const view = render(<BuilderPage />)

        const canvas = view.getByRole('application', { name: /schematic builder canvas/i })
        fireEvent.click(view.getByRole('button', { name: /reservoir.*hatched triangle/i }))
        fireEvent.pointerDown(canvas, { clientX: 100, clientY: 120, pointerId: 1, button: 0 })
        fireEvent.pointerUp(canvas, { clientX: 100, clientY: 120, pointerId: 1 })

        fireEvent.click(view.getByRole('button', { name: /junction.*small circle/i }))
        fireEvent.pointerDown(canvas, { clientX: 260, clientY: 120, pointerId: 2, button: 0 })
        fireEvent.pointerUp(canvas, { clientX: 260, clientY: 120, pointerId: 2 })

        fireEvent.click(view.getByRole('button', { name: /pipe.*connects two nodes/i }))
        const nodes = view.container.querySelectorAll('[data-element-id^="node-"]')
        expect(nodes).toHaveLength(2)
        fireEvent.pointerDown(nodes[0], { clientX: 100, clientY: 120, pointerId: 3, button: 0 })
        fireEvent.pointerUp(nodes[1], { clientX: 260, clientY: 120, pointerId: 3 })

        expect(view.getByRole('spinbutton', { name: /roughness c-factor/i })).toHaveValue(140)
        expect(view.getByRole('spinbutton', { name: /minor loss coefficient/i })).toHaveValue(0)
        expect(view.getByRole('combobox', { name: /status/i })).toHaveValue('OPEN')
    })

    it('renders the supplied artwork on placed nodes and links', () => {
        const view = render(<BuilderPage />)
        const canvas = view.getByRole('application', { name: /schematic builder canvas/i })
        const placeNode = (name: RegExp, x: number, pointerId: number) => {
            fireEvent.click(view.getByRole('button', { name }))
            fireEvent.pointerDown(canvas, { clientX: x, clientY: 120, pointerId, button: 0 })
            fireEvent.pointerUp(canvas, { clientX: x, clientY: 120, pointerId })
        }

        placeNode(/reservoir.*hatched triangle/i, 100, 1)
        placeNode(/junction.*small circle/i, 260, 2)
        placeNode(/tank.*rectangle/i, 420, 3)
        const nodes = view.container.querySelectorAll('[data-element-id^="node-"]')
        expect(Array.from(nodes, node => node.querySelector('image')?.getAttribute('href')))
            .toEqual(['/reservoir.svg', '/junction.svg', '/tank.svg'])

        const linkTools = [
            [/pipe.*connects two nodes/i, null],
            [/pump.*inline device/i, '/pump_clean.svg'],
            [/valve.*inline device/i, '/valve_clean.svg'],
            [/strainer.*inline device/i, '/strainer_clean.svg'],
        ] as const
        linkTools.forEach(([name, image], index) => {
            fireEvent.click(view.getByRole('button', { name }))
            fireEvent.pointerDown(nodes[0], { clientX: 100, clientY: 120, pointerId: index + 4, button: 0 })
            fireEvent.pointerUp(nodes[1], { clientX: 260, clientY: 120, pointerId: index + 4 })
            const links = view.container.querySelectorAll('[data-element-id^="link-"]')
            expect(links[index].querySelector('image')?.getAttribute('href') ?? null).toBe(image)
            expect(links[index].querySelector('image[href="/pipe.svg"]')).toBeNull()
        })

        const pipe = view.container.querySelector('[data-element-id^="link-"]')!
        const visibleLine = pipe.querySelector('line[stroke="#000000"]')!
        expect(Number(visibleLine.getAttribute('x1'))).toBeGreaterThan(100)
        expect(Number(visibleLine.getAttribute('x2'))).toBeLessThan(260)

        const drawingLayer = view.container.querySelector('svg > g')!
        expect(Array.from(drawingLayer.children).indexOf(pipe))
            .toBeLessThan(Array.from(drawingLayer.children).indexOf(nodes[0]))

        fireEvent.click(view.getByRole('button', { name: /pump.*inline device/i }))
        fireEvent.pointerDown(nodes[1], { clientX: 260, clientY: 120, pointerId: 8, button: 0 })
        fireEvent.pointerUp(nodes[0], { clientX: 100, clientY: 120, pointerId: 8 })
        const reversedPump = view.container.querySelectorAll('[data-element-id^="link-"]')[4]
        expect(reversedPump.querySelector('image')?.getAttribute('transform')).toMatch(/^rotate\(90 /)
    })

    it('rotates clean symbols with vertical and diagonal links', () => {
        const view = render(<BuilderPage />)
        const canvas = view.getByRole('application', { name: /schematic builder canvas/i })
        const positions = [[100, 100], [100, 260], [260, 420]] as const
        positions.forEach(([x, y], index) => {
            fireEvent.click(view.getByRole('button', { name: /junction.*small circle/i }))
            fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: index + 1, button: 0 })
            fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: index + 1 })
        })
        const nodes = view.container.querySelectorAll('[data-element-id^="node-"]')
        const connect = (name: RegExp, first: number, second: number, pointerId: number) => {
            fireEvent.click(view.getByRole('button', { name }))
            fireEvent.pointerDown(nodes[first], { clientX: positions[first][0], clientY: positions[first][1], pointerId, button: 0 })
            fireEvent.pointerUp(nodes[second], { clientX: positions[second][0], clientY: positions[second][1], pointerId })
        }
        connect(/pump.*inline device/i, 0, 1, 4)
        connect(/valve.*inline device/i, 1, 2, 5)
        const links = view.container.querySelectorAll('[data-element-id^="link-"]')
        expect(links[0].querySelector('image')?.getAttribute('transform')).toMatch(/^rotate\(0 /)
        expect(links[1].querySelector('image')?.getAttribute('transform')).toMatch(/^rotate\(45 /)
    })

    it('connects pump and strainer through their vertical artwork ports', () => {
        const view = render(<BuilderPage />)
        const canvas = view.getByRole('application', { name: /schematic builder canvas/i })
        for (const [index, x] of [100, 260].entries()) {
            fireEvent.click(view.getByRole('button', { name: /junction.*small circle/i }))
            fireEvent.pointerDown(canvas, { clientX: x, clientY: 120, pointerId: index + 1, button: 0 })
            fireEvent.pointerUp(canvas, { clientX: x, clientY: 120, pointerId: index + 1 })
        }
        const nodes = view.container.querySelectorAll('[data-element-id^="node-"]')
        for (const [index, name] of [/pump.*inline device/i, /strainer.*inline device/i].entries()) {
            fireEvent.click(view.getByRole('button', { name }))
            fireEvent.pointerDown(nodes[0], { clientX: 100, clientY: 120, pointerId: index + 3, button: 0 })
            fireEvent.pointerUp(nodes[1], { clientX: 260, clientY: 120, pointerId: index + 3 })
        }
        const links = view.container.querySelectorAll('[data-element-id^="link-"]')
        for (const [index, portSpan] of [45, 44].entries()) {
            const link = links[index]
            expect(link.querySelector('image')?.getAttribute('transform')).toMatch(/^rotate\(-90 /)
            const strokes = link.querySelectorAll('line:not([stroke="transparent"])')
            expect(Number(strokes[0].getAttribute('x2'))).toBeCloseTo(180 - portSpan / 2)
            expect(Number(strokes[1].getAttribute('x1'))).toBeCloseTo(180 + portSpan / 2)
        }
    })

    it('shows dirty indicator after edits', () => {
        render(<BuilderPage />)
        const nameInput = screen.getByRole('textbox', { name: /schematic name/i })
        fireEvent.change(nameInput, { target: { value: 'Renamed schematic' } })
        expect(screen.getByLabelText(/unsaved changes/i)).toBeInTheDocument()
    })

    it('shows navigation guard when starting new with dirty state', () => {
        render(<BuilderPage />)
        const nameInput = screen.getByRole('textbox', { name: /schematic name/i })
        fireEvent.change(nameInput, { target: { value: 'Renamed schematic' } })

        fireEvent.click(screen.getByRole('button', { name: /new/i }))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/save before leaving/i)).toBeInTheDocument()
    })


})
