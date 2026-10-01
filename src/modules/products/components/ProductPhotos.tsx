import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { ArrowLeftRight, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProductImage } from '../api/products'
import { useDeleteProductImage, useProductImages, useSaveProductImage, useSetMainProductImage } from '../hooks/useProducts'
import { ACCEPT_ATTRIBUTE, imageFileProblem, productImageUrl, type ProductImagePosition } from '../lib/productImages'

/** Files chosen before the dish exists; uploaded right after it is created. */
export type PendingPhotos = Partial<Record<ProductImagePosition, File>>

const SLOT_LABEL: Record<ProductImagePosition, string> = { 1: 'Principal', 2: 'Segunda foto' }

/** Object URL for a local file, released when it changes or unmounts. */
function useObjectUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  return url
}

/**
 * Photos of a dish (ADR 0018): up to two, the first one is the main one.
 * Choose or drop a file and it is saved at once (no extra "Guardar"); while
 * it uploads the local preview is shown. For a dish not created yet
 * (`productId` null) the files wait in `pending` until it is.
 */
export function ProductPhotos({
  productId,
  productName,
  canEdit,
  pending,
  onPendingChange,
}: {
  productId: string | null
  productName: string
  canEdit: boolean
  pending?: PendingPhotos
  onPendingChange?: (pending: PendingPhotos) => void
}) {
  const { data: images = [], isLoading } = useProductImages(productId)
  const [viewing, setViewing] = useState<ProductImagePosition | null>(null)
  const byPosition = (p: ProductImagePosition) => images.find((i) => i.position === p)
  const hasMain = productId ? Boolean(byPosition(1)) : Boolean(pending?.[1])

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-neutral-400">Fotos</span>
        <span className={typography.caption}>Hasta 2 · JPG, PNG o WebP</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {([1, 2] as const).map((position) =>
          productId ? (
            <SavedSlot
              key={position}
              productId={productId}
              productName={productName}
              position={position}
              image={byPosition(position)}
              other={byPosition(position === 1 ? 2 : 1)}
              loading={isLoading}
              canEdit={canEdit}
              disabled={position === 2 && !hasMain}
              onView={() => setViewing(position)}
            />
          ) : (
            <PendingSlot
              key={position}
              position={position}
              file={pending?.[position]}
              disabled={!canEdit || (position === 2 && !hasMain)}
              onChange={(file) => {
                const next = { ...pending, [position]: file }
                if (!file) delete next[position]
                // The second photo moves up if the main one is removed.
                if (position === 1 && !file && next[2]) {
                  next[1] = next[2]
                  delete next[2]
                }
                onPendingChange?.(next)
              }}
            />
          ),
        )}
      </div>
      {viewing && images.length > 0 && <PhotoViewer name={productName} images={images} start={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function EmptySlot({ label, hint, disabled, onPick }: { label: string; hint: string; disabled?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="flex size-full flex-col items-center justify-center gap-1.5 border-dashed bg-neutral-900/40 text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900/40"
    >
      <ImagePlus size={18} aria-hidden />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-neutral-600">{hint}</span>
    </button>
  )
}

function SavedSlot({
  productId,
  productName,
  position,
  image,
  other,
  loading,
  canEdit,
  disabled,
  onView,
}: {
  productId: string
  productName: string
  position: ProductImagePosition
  image: ProductImage | undefined
  other: ProductImage | undefined
  loading: boolean
  canEdit: boolean
  disabled: boolean
  onView: () => void
}) {
  const save = useSaveProductImage(productId)
  const remove = useDeleteProductImage(productId)
  const makeMain = useSetMainProductImage(productId)
  const { show } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = useObjectUrl(file)
  const inputRef = useRef<HTMLInputElement>(null)
  const pick = () => inputRef.current?.click()

  async function upload(next: File) {
    const problem = imageFileProblem(next)
    if (problem) {
      setError(problem)
      setFile(null)
      return
    }
    setError(null)
    setFile(next)
    try {
      await save.mutateAsync({ position, file: next })
      show(image ? 'Foto reemplazada.' : 'Foto guardada.')
      setFile(null)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo subir la foto.'))
    }
  }

  const busy = save.isPending || remove.isPending || makeMain.isPending
  const shown = preview ?? (image ? productImageUrl(image.path) : null)

  return (
    <div
      onDragOver={(e) => canEdit && !disabled && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files?.[0]
        if (f && canEdit && !disabled) void upload(f)
      }}
      className={clsx('group relative aspect-[4/3] overflow-hidden rounded-xl border', error ? 'border-red-800' : 'border-neutral-800')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label={`${image ? 'Reemplazar' : 'Agregar'} ${SLOT_LABEL[position].toLowerCase()} de ${productName}`}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />

      {loading ? (
        <div className="size-full animate-pulse bg-neutral-900" />
      ) : shown ? (
        <button type="button" onClick={onView} disabled={Boolean(preview)} className="block size-full" aria-label={`Ver fotos de ${productName}`}>
          <img src={shown} alt="" className={clsx('size-full object-cover transition-opacity', save.isPending && 'opacity-60')} />
        </button>
      ) : canEdit ? (
        <EmptySlot label={position === 1 ? 'Agregar foto' : 'Segunda foto'} hint={disabled ? 'Primero la principal' : 'Toca o arrastra'} disabled={disabled} onPick={pick} />
      ) : (
        <div className="flex size-full items-center justify-center bg-neutral-900/40 text-[11px] text-neutral-600">Sin foto</div>
      )}

      {shown && (
        <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-100 backdrop-blur">
          {position === 1 && <Star size={9} className="fill-current text-amber-300" aria-hidden />}
          {SLOT_LABEL[position]}
        </span>
      )}

      {save.isPending && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30" role="status" aria-label="Subiendo foto">
          <Loader2 size={20} className="animate-spin text-white" />
        </span>
      )}

      {error && !save.isPending && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-red-950/90 px-2 py-1.5 text-[11px] text-red-200" role="alert">
          <span className="min-w-0 truncate">{error}</span>
          {file && (
            <button type="button" onClick={() => void upload(file)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-100 hover:underline">
              <RefreshCw size={10} aria-hidden /> Reintentar
            </button>
          )}
        </div>
      )}

      {canEdit && image && !preview && !busy && !error && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {position === 2 && other && (
            <SlotAction icon={ArrowLeftRight} label="Hacer principal" onClick={() => makeMain.mutate(image.id, { onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar la principal.'), 'error') })} />
          )}
          <SlotAction icon={RefreshCw} label="Reemplazar" onClick={pick} />
          <SlotAction
            icon={Trash2}
            label="Quitar"
            onClick={() =>
              remove.mutate(image, {
                onSuccess: () => show('Foto quitada.'),
                onError: (err) => show(getErrorMessage(err, 'No se pudo quitar la foto.'), 'error'),
              })
            }
          />
        </div>
      )}
    </div>
  )
}

function SlotAction({ icon: Icon, label, onClick }: { icon: typeof Trash2; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md bg-black/50 p-1.5 text-neutral-100 backdrop-blur transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none"
    >
      <Icon size={13} />
    </button>
  )
}

function PendingSlot({ position, file, disabled, onChange }: { position: ProductImagePosition; file: File | undefined; disabled: boolean; onChange: (file: File | undefined) => void }) {
  const preview = useObjectUrl(file)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function choose(next: File) {
    const problem = imageFileProblem(next)
    setError(problem)
    if (!problem) onChange(next)
  }

  return (
    <div
      onDragOver={(e) => !disabled && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files?.[0]
        if (f && !disabled) choose(f)
      }}
      className={clsx('group relative aspect-[4/3] overflow-hidden rounded-xl border', error ? 'border-red-800' : 'border-neutral-800')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Elegir ${SLOT_LABEL[position].toLowerCase()}`}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) choose(f)
          e.target.value = ''
        }}
      />
      {preview ? (
        <>
          <img src={preview} alt="" className="size-full object-cover" />
          <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-100">
            {SLOT_LABEL[position]} · se guarda al crear
          </span>
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1.5">
            <SlotAction icon={RefreshCw} label="Cambiar" onClick={() => inputRef.current?.click()} />
            <SlotAction icon={Trash2} label="Quitar" onClick={() => onChange(undefined)} />
          </div>
        </>
      ) : (
        <EmptySlot label={position === 1 ? 'Agregar foto' : 'Segunda foto'} hint={disabled ? 'Primero la principal' : 'Toca o arrastra'} disabled={disabled} onPick={() => inputRef.current?.click()} />
      )}
      {error && <p className="absolute inset-x-0 bottom-0 bg-red-950/90 px-2 py-1.5 text-[11px] text-red-200">{error}</p>}
    </div>
  )
}

/** Both photos, large, with a switch between them. */
export function PhotoViewer({ name, images, start, onClose }: { name: string; images: ProductImage[]; start: ProductImagePosition; onClose: () => void }) {
  const [current, setCurrent] = useState<ProductImagePosition>(images.some((i) => i.position === start) ? start : images[0].position)
  const image = images.find((i) => i.position === current) ?? images[0]
  return (
    <Modal open onClose={onClose} title={name} description={images.length > 1 ? `${current === 1 ? 'Principal' : 'Segunda foto'} · ${images.length} fotos` : undefined}>
      <div className="space-y-3">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-neutral-950">
          <img src={productImageUrl(image.path)} alt={`${name}: ${current === 1 ? 'foto principal' : 'segunda foto'}`} className="max-h-full max-w-full object-contain" />
        </div>
        {images.length > 1 && (
          <div className="flex justify-center gap-2">
            {images.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setCurrent(i.position)}
                aria-label={i.position === 1 ? 'Ver la foto principal' : 'Ver la segunda foto'}
                aria-pressed={i.position === current}
                className={clsx('size-14 overflow-hidden rounded-lg border-2 transition-colors', i.position === current ? 'border-brasa-500' : 'border-transparent opacity-60 hover:opacity-100')}
              >
                <img src={productImageUrl(i.path)} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
