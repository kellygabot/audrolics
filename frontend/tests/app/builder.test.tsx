import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import BuilderPage from '@/app/builder/page'

describe('BuilderPage', () => {
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
})
