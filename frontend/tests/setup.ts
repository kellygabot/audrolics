import { vi } from 'vitest'

// Mock Next.js App Router hooks so components using useRouter / useSearchParams
// can be rendered in jsdom without the full Next.js runtime.
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/',
}))
