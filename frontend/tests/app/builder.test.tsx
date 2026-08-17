import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import BuilderPage from '@/app/builder/page'

describe('BuilderPage', () => {
    it('renders the builder shell', () => {
        render(<BuilderPage />)
        expect(screen.getByRole('textbox', { name: /schematicname/i })
        ).toHaveValue('Untitled schematic')

        expect(screen.getByRole('application', { name: /schematic builder canvas/i })
        ).toBeInTheDocument()

        expect(screen.getByRole('button', {
            name: /save/i
        })).toBeInTheDocument()
    })
})