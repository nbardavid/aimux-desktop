import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { Image } from '../chat/model'

import { imageUrl } from './pasted-images'

const POP = 'animate-in fade-in zoom-in-95 duration-160 ease-out'

/**
 * Pasted images as thumbnails: square and removable over the composer, or at their own
 * shape over the prompt that sent them.
 */
export function ImageStrip({
  className,
  images,
  onRemove,
}: {
  images: readonly Image[]
  /** Over the composer: each thumbnail has its ×. */
  onRemove?: (index: number) => void
  className?: string
}) {
  if (images.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {images.map((image, i) => (
        // Pasted twice, an image is twice the same data: its place tells them apart.
        // oxlint-disable-next-line no-array-index-key
        <div key={i} className={cn('group/image relative flex-none', POP)}>
          <img
            src={imageUrl(image)}
            alt={`Image ${i + 1}`}
            draggable={false}
            className={cn(
              'rounded-md border bg-background object-cover',
              onRemove ? 'size-14' : 'max-h-40 max-w-60'
            )}
          />
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove image ${i + 1}`}
              className="bg-foreground text-background absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full opacity-0 transition-opacity duration-120 group-hover/image:opacity-100 focus-visible:opacity-100"
              onClick={() => onRemove(i)}
            >
              <XIcon className="size-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
