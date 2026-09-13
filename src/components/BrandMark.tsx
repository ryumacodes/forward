import { Plane } from '../icons'

export function BrandMark({ className = '' }: { className?: string }) {
  return <span className={`brand-symbol ${className}`.trim()} aria-hidden="true"><Plane/></span>
}
