import clsx from 'clsx'
import { useState } from 'react'
import { productImageUrl } from '../lib/productImages'

/** Calm, warm tones for dishes without a photo; the same dish always gets the same one. */
const PLACEHOLDER_TONES = [
  'bg-brasa-500/15 text-brasa-200',
  'bg-amber-500/15 text-amber-200',
  'bg-emerald-500/12 text-emerald-200',
  'bg-sky-500/12 text-sky-200',
  'bg-rose-500/12 text-rose-200',
  'bg-violet-500/12 text-violet-200',
] as const

function toneFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return PLACEHOLDER_TONES[Math.abs(hash) % PLACEHOLDER_TONES.length]
}

const SIZES = {
  xs: 'size-6 rounded-md text-[10px]',
  sm: 'size-8 rounded-lg text-xs',
  md: 'size-10 rounded-lg text-sm',
  lg: 'size-16 rounded-xl text-lg',
} as const

/**
 * Small square photo of a dish, or its initial on a soft tone when it has
 * none. Lazy-loaded with its size reserved, so lists never jump.
 */
export function ProductThumb({
  name,
  path,
  toneSeed,
  size = 'md',
  className,
}: {
  name: string
  path: string | null | undefined
  /** What picks the placeholder tone (e.g. the category); the name by default. */
  toneSeed?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = path && !failed

  return (
    <span
      className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none', SIZES[size], !showImage && toneFor(toneSeed || name), showImage && 'bg-neutral-800', className)}
      aria-hidden
    >
      {showImage ? (
        <img
          src={productImageUrl(path)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={clsx('size-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        (name.trim()[0] ?? '·').toUpperCase()
      )}
    </span>
  )
}
