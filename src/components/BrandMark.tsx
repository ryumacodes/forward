export function BrandMark({ className = '' }: { className?: string }) {
  return <span className={`brand-symbol ${className}`.trim()} aria-hidden="true">
    <img src="/favicon.svg" alt="" draggable="false"/>
  </span>
}
