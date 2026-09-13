export type DiscoverySource = {
  url: string
  title: string
}

export type DiscoveredSupplier = {
  id: string
  name: string
  websiteUrl: string
  locality: string
  summary: string
  products: string[]
  phone: string | null
  email: string | null
  confidence: number
  semanticScore: number
  sources: DiscoverySource[]
  evidenceCheckedAt: string
  mode: 'live'
}

const blockedHosts = new Set(['localhost', 'localhost.localdomain'])

export function isPotentiallyPublicUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!host || blockedHosts.has(host) || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (/^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) return false
    return true
  } catch {
    return false
  }
}

export function extractVisibleText(html: string, maxLength = 20_000) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function uniquePublicSources(sources: DiscoverySource[]) {
  const seen = new Set<string>()
  return sources.filter(source => {
    if (!isPotentiallyPublicUrl(source.url)) return false
    const normalized = new URL(source.url).toString()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  }).map(source => ({...source, url:new URL(source.url).toString()}))
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0, leftNorm = 0, rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0
}
