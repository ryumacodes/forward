import { describe, expect, test } from 'bun:test'
import { deliveryPointFor, distanceLabel, straightLineDistanceKm } from '../src/features/location/proximity'

describe('supplier proximity', () => {
  test('uses a known demo delivery centroid and produces a stable distance', () => {
    const delivery=deliveryPointFor('24 Flinders Lane, Melbourne')
    expect(delivery).not.toBeNull()
    const distance=straightLineDistanceKm(delivery!,{latitude:-37.7935,longitude:144.9300})
    expect(distance).toBeGreaterThan(3)
    expect(distance).toBeLessThan(4)
    expect(distanceLabel(distance)).toMatch(/^3\.\d km$/)
  })

  test('does not guess coordinates for an unknown address', () => {
    expect(deliveryPointFor('Unknown delivery location')).toBeNull()
  })

  test('fails closed for invalid coordinates and distances', () => {
    expect(()=>straightLineDistanceKm({latitude:91,longitude:0},{latitude:0,longitude:0})).toThrow()
    expect(()=>distanceLabel(-1)).toThrow()
  })
})
