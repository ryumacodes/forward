export type GeoPoint = { latitude: number; longitude: number }

const deliveryCentroids: Array<{matches: RegExp; point: GeoPoint}> = [
  {matches:/flinders lane|melbourne vic|melbourne cbd/i,point:{latitude:-37.8136,longitude:144.9631}},
]

export function deliveryPointFor(location: string): GeoPoint | null {
  return deliveryCentroids.find(item => item.matches.test(location))?.point ?? null
}

export function straightLineDistanceKm(from: GeoPoint, to: GeoPoint) {
  validatePoint(from)
  validatePoint(to)
  const radians = (degrees: number) => degrees * Math.PI / 180
  const earthRadiusKm = 6371.0088
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const startLatitude = radians(from.latitude)
  const endLatitude = radians(to.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function distanceLabel(kilometres: number) {
  if (!Number.isFinite(kilometres) || kilometres < 0) throw new Error('Distance must be a non-negative number.')
  return kilometres < 10 ? `${kilometres.toFixed(1)} km` : `${Math.round(kilometres)} km`
}

function validatePoint(point: GeoPoint) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
    throw new Error('Coordinates are outside valid latitude or longitude bounds.')
  }
}
