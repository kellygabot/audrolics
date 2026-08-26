import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import BuilderPage from '@/app/builder/page'

describe('BuilderPage', () => {
    afterEach(() => {
        cleanup()
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
    })

    it('renders the builder shell', () => {
        render(<BuilderPage />)
        expect(screen.getByRole('textbox', { name: /schematic name/i })
        ).toHaveValue('Untitled schematic')

        expect(screen.getByRole('application', { name: /schematic builder canvas/i })
        ).toBeInTheDocument()

        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
        expect(screen.getByLabelText(/line color/i)).toBeInTheDocument()
        expect(screen.getByText(/strainer \/ filter/i)).toBeInTheDocument()
    })

    it('creates pipes with hydraulic defaults', () => {
        const view = render(<BuilderPage />)

        const canvas = view.getByRole('application', { name: /schematic builder canvas/i })
        fireEvent.click(view.getByRole('button', { name: /reservoir/i }))
        fireEvent.pointerDown(canvas, { clientX: 100, clientY: 120, pointerId: 1, button: 0 })
        fireEvent.pointerUp(canvas, { clientX: 100, clientY: 120, pointerId: 1 })

        fireEvent.click(view.getByRole('button', { name: /junction/i }))
        fireEvent.pointerDown(canvas, { clientX: 260, clientY: 120, pointerId: 2, button: 0 })
        fireEvent.pointerUp(canvas, { clientX: 260, clientY: 120, pointerId: 2 })

        fireEvent.click(view.getByRole('button', { name: /pipe/i }))
        const nodes = view.container.querySelectorAll('[data-element-id^="node-"]')
        expect(nodes).toHaveLength(2)
        fireEvent.pointerDown(nodes[0], { clientX: 100, clientY: 120, pointerId: 3, button: 0 })
        fireEvent.pointerUp(nodes[1], { clientX: 260, clientY: 120, pointerId: 3 })

        expect(view.getByRole('spinbutton', { name: /roughness c-factor/i })).toHaveValue(140)
        expect(view.getByRole('spinbutton', { name: /minor loss coefficient/i })).toHaveValue(0)
        expect(view.getByRole('combobox', { name: /status/i })).toHaveValue('OPEN')
    })
})
