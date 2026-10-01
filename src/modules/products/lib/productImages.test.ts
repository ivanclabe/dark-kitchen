import { describe, expect, it } from 'vitest'
import { fitWithin, imageFileProblem } from './productImages'

const file = (type: string, size = 1000, name = 'foto') => ({ type, size, name })

describe('dish photos (ADR 0018)', () => {
  it('accepts JPG, PNG, WebP and phone HEIC', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) expect(imageFileProblem(file(t))).toBeNull()
    expect(imageFileProblem(file('', 1000, 'IMG_0001.HEIC'))).toBeNull()
  })
  it('rejects other files and very large ones', () => {
    expect(imageFileProblem(file('application/pdf'))).toMatch(/JPG/)
    expect(imageFileProblem(file('image/gif'))).toMatch(/JPG/)
    expect(imageFileProblem(file('image/jpeg', 16 * 1024 * 1024))).toMatch(/15 MB/)
  })
  it('shrinks to 1600 px keeping proportions, never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
