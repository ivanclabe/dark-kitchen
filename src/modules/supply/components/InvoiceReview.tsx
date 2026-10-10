import { useUnits } from '@/shared/hooks/useUnits'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, FileText, ListChecks, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { InvoiceImportError, matchInvoice } from '../api/invoiceImport'
import { useIngredients } from '../hooks/useIngredients'
import { useDiscardImport, useIngredientPurchaseUnits, useSavePurchaseFromImport } from '../hooks/useInvoiceImport'
import { useSuppliers } from '../hooks/useSuppliers'
import { AUTO_PICK_SCORE, draftProblems, initialDraft, lineProblems, reconcile, toPayload, type IngredientUnitInfoById } from '../lib/invoiceReview'
import type { InvoiceImport, InvoiceMatch, ReviewDraft, ReviewLine, SupplierChoice } from '../types/invoiceImport'
import { InvoicePreview } from './InvoicePreview'
import { ReviewLineCard } from './ReviewLineCard'
import { SupplierChoiceCard } from './SupplierChoiceCard'

/**
 * The review screen (ADR 0049, D6): the invoice on one side, what was read on
 * the other. Nothing is saved until the person says so, and nothing touches
 * the inventory until the purchase is confirmed.
 */
export function InvoiceReview({
  invoice,
  match: initialMatch,
  onSaved,
  onDiscarded,
}: {
  invoice: InvoiceImport & { extraction: NonNullable<InvoiceImport['extraction']> }
  match: InvoiceMatch
  onSaved: (purchaseId: string) => void
  onDiscarded: () => void
}) {
  const extraction = invoice.extraction
  const { can } = useActiveKitchen()
  const { show } = useToast()
  const { data: units = [] } = useUnits()
  const { data: allIngredients = [] } = useIngredients()
  const { data: suppliers = [] } = useSuppliers()
  const { data: purchaseUnits = [] } = useIngredientPurchaseUnits()
  const save = useSavePurchaseFromImport()
  const discard = useDiscardImport()

  const [match, setMatch] = useState(initialMatch)
  const [draft, setDraft] = useState<ReviewDraft>(() => initialDraft(extraction, initialMatch, units))
  // Units arrive after the first render: the units of the first draft are re-read once they do.
  const [unitsReady, setUnitsReady] = useState(units.length > 0)
  if (!unitsReady && units.length > 0) {
    setUnitsReady(true)
    setDraft(initialDraft(extraction, match, units))
  }
  const [showInvoice, setShowInvoice] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [error, setError] = useState<{ message: string; purchaseId?: string } | null>(null)

  const ingredients: IngredientUnitInfoById = useMemo(() => {
    const map: IngredientUnitInfoById = new Map()
    for (const i of allIngredients) {
      const base = units.find((u) => u.code === i.baseUnitCode)
      if (!base) continue
      map.set(i.id, {
        baseUnitCode: i.baseUnitCode,
        baseUnitType: base.unitType,
        avgCost: i.avgCost,
        name: i.name,
        purchaseUnits: purchaseUnits.filter((p) => p.ingredientId === i.id).map((p) => ({ unitCode: p.unitCode, factor: p.factor })),
      })
    }
    return map
  }, [allIngredients, units, purchaseUnits])

  const ingredientOptions = useMemo(
    () => allIngredients.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name, sublabel: `${i.code} · ${i.baseUnitCode}` })),
    [allIngredients],
  )

  const problems = draftProblems(draft, units, ingredients)
  const totals = reconcile(draft.lines, extraction.invoice)
  const tax = draft.tax ?? 0
  const included = draft.lines.filter((l) => !l.ignored)
  const pendingLines = included.filter((l) => lineProblems(l, units, ingredients).length > 0).length

  function setLine(key: string, patch: Partial<ReviewLine>) {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
  }

  /** Another supplier changes what was learned: fresh suggestions (the choices made stay). */
  async function setSupplier(choice: SupplierChoice | null) {
    setDraft((d) => ({ ...d, supplier: choice }))
    setError(null)
    if (choice?.kind !== 'existing') return
    try {
      const next = await matchInvoice(extraction, choice.id)
      setMatch(next)
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((l) => {
          const suggestions = next.lines.find((m) => m.index === l.index)?.suggestions ?? l.suggestions
          const top = suggestions[0]
          if (l.ingredient || !top || top.score < AUTO_PICK_SCORE) return { ...l, suggestions }
          return { ...l, suggestions, ingredient: { kind: 'existing', id: top.ingredientId }, unitCode: top.learnedUnitCode ?? l.unitCode ?? top.baseUnitCode }
        }),
      }))
    } catch {
      // The suggestions stay as they were; nothing else depends on this.
    }
  }

  async function handleSave(confirm: boolean) {
    setError(null)
    try {
      const result = await save.mutateAsync({ importId: invoice.id, payload: toPayload(draft, units, ingredients), confirm })
      const created = [result.supplierCreated && 'el proveedor', result.ingredientsCreated > 0 && `${result.ingredientsCreated} insumo(s)`].filter(Boolean).join(' y ')
      show(
        confirm
          ? `Compra confirmada: el inventario ya está actualizado.${created ? ` Se creó ${created}.` : ''}`
          : `Compra guardada como borrador.${created ? ` Se creó ${created}.` : ''} Confírmala cuando la revises.`,
      )
      onSaved(result.purchaseId)
    } catch (err) {
      setConfirmOpen(false)
      if (err instanceof InvoiceImportError && err.code === 'DUPLICATE_INVOICE') {
        setError({ message: err.message, purchaseId: match.duplicateInvoice?.purchaseId })
      } else {
        setError({ message: getErrorMessage(err, 'No se pudo guardar la compra. Intenta de nuevo.') })
      }
    }
  }

  async function handleDiscard() {
    await discard.mutateAsync(invoice.id)
    show('Factura descartada.')
    onDiscarded()
  }

  const preview = <InvoicePreview filePath={invoice.filePath} mimeType={invoice.mimeType} fileName={invoice.fileName} />

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The invoice: beside on large screens, behind a button on phones. */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 h-[calc(100vh-8rem)]">{preview}</div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => setShowInvoice((v) => !v)}>
            {showInvoice ? 'Ocultar la factura' : 'Ver la factura'}
          </Button>
          {showInvoice && <div className="mt-3 h-[70vh]">{preview}</div>}
        </div>

        {extraction.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle size={14} aria-hidden /> Al leerla, Quanela notó:
            </p>
            <ul className="mt-1 list-disc pl-5 text-amber-200/90">
              {extraction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {match.duplicateInvoice && draft.supplier?.kind === 'existing' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
            <p>
              La factura <strong>{match.duplicateInvoice.invoiceNumber}</strong> de este proveedor ya está registrada.
            </p>
            <KitchenLink to={`/supply/compras/${match.duplicateInvoice.purchaseId}`} className="font-medium text-red-100 underline">
              Ver la compra
            </KitchenLink>
          </div>
        )}

        <SupplierChoiceCard
          extraction={extraction}
          match={match}
          suppliers={suppliers}
          value={draft.supplier}
          canCreate={can('suppliers.edit')}
          onChange={(choice) => void setSupplier(choice)}
        />

        <Card title="Factura" icon={FileText}>
          <FormGrid>
            <FormField label="Número" required hint={extraction.confidence.number !== 'alta' ? 'Leído con dudas: revísalo' : undefined}>
              {(a11y) => <Input {...a11y} value={draft.invoiceNumber} onChange={(e) => setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))} />}
            </FormField>
            <FormField label="Fecha" required hint={extraction.confidence.date !== 'alta' ? 'Leída con dudas: revísala' : undefined}>
              {(a11y) => <Input {...a11y} type="date" value={draft.invoiceDate} onChange={(e) => setDraft((d) => ({ ...d, invoiceDate: e.target.value }))} />}
            </FormField>
            <FormField label="IVA" info="Impuesto de la factura. Se suma al total de la compra; no cambia el costo de los insumos.">
              {(a11y) => <CurrencyInput {...a11y} value={draft.tax} onValueChange={(v) => setDraft((d) => ({ ...d, tax: v }))} />}
            </FormField>
            <FormField label="Notas">
              {(a11y) => <Input {...a11y} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Opcional" />}
            </FormField>
          </FormGrid>
        </Card>

        <Card
          title="Líneas"
          icon={ListChecks}
          description={
            pendingLines
              ? `${pendingLines} por completar · ${draft.lines.length - included.length} ignorada(s)`
              : `Todas listas · ${draft.lines.length - included.length} ignorada(s)`
          }
        >
          {draft.lines.length === 0 ? (
            <p className="text-sm text-neutral-400">No se leyó ninguna línea. Descarta esta factura y crea la compra a mano.</p>
          ) : (
            <ul className="space-y-3">
              {draft.lines.map((l, i) => (
                <ReviewLineCard
                  key={l.key}
                  line={l}
                  number={i + 1}
                  units={units}
                  ingredients={ingredients}
                  ingredientOptions={ingredientOptions}
                  canCreateIngredient={can('inventory.create')}
                  onChange={(patch) => setLine(l.key, patch)}
                />
              ))}
            </ul>
          )}
        </Card>

        {/* Totals and saving */}
        <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-neutral-800/80 bg-neutral-950/95 p-4 shadow-lg backdrop-blur">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-neutral-500">Líneas</dt>
              <dd className="font-semibold text-neutral-100 tabular-nums">{formatMoney(totals.linesTotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">IVA</dt>
              <dd className="font-semibold text-neutral-100 tabular-nums">{formatMoney(tax)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Total</dt>
              <dd className="font-semibold text-neutral-100 tabular-nums">{formatMoney(totals.linesTotal + tax)}</dd>
            </div>
          </dl>
          {totals.expected !== null && (
            <p className={clsx('mt-2 flex items-center gap-1.5 text-xs', totals.ok ? 'text-emerald-400' : 'text-amber-400')}>
              {totals.ok ? <CheckCircle2 size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
              {totals.ok
                ? `Cuadra con el subtotal de la factura (${formatMoney(totals.expected)}).`
                : `No cuadra: la factura dice ${formatMoney(totals.expected)} antes de IVA (diferencia ${formatMoney(totals.difference ?? 0)}). Revisa cantidades y costos.`}
            </p>
          )}
          {problems.length > 0 && <p className="mt-2 text-xs text-red-400">Para guardar: {problems.join(' · ')}.</p>}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error.message}{' '}
              {error.purchaseId && (
                <KitchenLink to={`/supply/compras/${error.purchaseId}`} className="underline">
                  Ver la compra
                </KitchenLink>
              )}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDiscardOpen(true)} className="!text-neutral-400 hover:!text-red-400">
              Descartar
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Save} onClick={() => void handleSave(false)} loading={save.isPending && !confirmOpen} disabled={problems.length > 0 || save.isPending}>
                Guardar borrador
              </Button>
              {can('purchasing.confirm') && (
                <Button variant="primary" icon={CheckCircle2} onClick={() => setConfirmOpen(true)} disabled={problems.length > 0 || save.isPending}>
                  Guardar y confirmar
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">El borrador no mueve el inventario. Al confirmar, entra el stock y se actualiza el costo promedio.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleSave(true)}
        title="Guardar y confirmar la compra"
        confirmLabel="Sí, confirmar"
        pending={save.isPending}
        description={
          <p>
            Esto registra la compra ({formatMoney(totals.linesTotal + tax, { code: true })}) y la confirma: entran al inventario los {included.length} insumo(s) y se
            actualiza su costo promedio. No se puede deshacer; un error se corrige después con un ajuste.
          </p>
        }
      />
      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => void handleDiscard()}
        title="Descartar esta factura"
        confirmLabel="Sí, descartar"
        pending={discard.isPending}
        description={<p>No se guarda nada de lo leído. La puedes volver a subir cuando quieras.</p>}
      />
    </div>
  )
}
