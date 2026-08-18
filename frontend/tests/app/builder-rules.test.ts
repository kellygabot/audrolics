import { describe, expect, it } from 'vitest'
import { fitToView, validateFieldValue, validateTankLevels } from '@/lib/builder-rules'

describe('builder rules', () => {
    it('validates numeric SRS ranges with clear messages', () => {
        expect(validateFieldValue({ key: 'elevation', label: 'Elevation', kind: 'number', unit: 'm' }, -101))
            .toBe('Elevation must be between -100 m and 5000 m.')
        expect(validateFieldValue({ key: 'length', label: 'Length', kind: 'number', unit: 'm' }, 0))
            .toBe('Length must be greater than 0 m and no more than 100000 m.')
        expect(validateFieldValue({ key: 'roughness', label: 'Roughness C-factor', kind: 'number' }, 151))
            .toBe('Roughness C-factor must be between 1 and 150.')
    })

    it('validates pump and GPV curve shape', () => {
        expect(validateFieldValue(
            { key: 'pump_curve', label: 'Pump Curve', kind: 'curve', yKey: 'head' },
            [{ flow: '1', head: '10' }, { flow: '2', head: '11' }],
        )).toBe('Pump head must decrease as flow increases.')

        expect(validateFieldValue(
            { key: 'gpv_curve', label: 'GPV Headloss Curve', kind: 'curve', yKey: 'headloss' },
            [{ flow: '1', headloss: '10' }, { flow: '1', headloss: '12' }],
        )).toBe('Curve flow values cannot repeat.')
    })

    it('validates tank level ordering', () => {
        expect(validateTankLevels({ min_level: '1', initial_level: '5', max_level: '3' }))
            .toBe('Tank levels must follow 0 <= min <= initial <= max.')
        expect(validateTankLevels({ min_level: '1', initial_level: '2', max_level: '3' })).toBeUndefined()
    })

    it('fits diagrams into the current viewport', () => {
        expect(fitToView([], { width: 500, height: 300 })).toEqual({ zoom: 100, pan: { x: 0, y: 0 } })

        const fitted = fitToView([{ x: 0, y: 0 }, { x: 200, y: 100 }], { width: 600, height: 400 })
        expect(fitted.zoom).toBeGreaterThanOrEqual(50)
        expect(fitted.zoom).toBeLessThanOrEqual(200)
        expect(Number.isFinite(fitted.pan.x)).toBe(true)
        expect(Number.isFinite(fitted.pan.y)).toBe(true)
    })
})
