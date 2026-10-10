import type { Unit } from '@/shared/api/units'
import { Badge } from '@/shared/ui/Badge'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { Input, Select } from '@/shared/ui/FormField'
import { NumberInput } from '@/shared/ui/NumberInput'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, CircleCheck, EyeOff, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import {
  knownFactor,
  lineProblems,
  lineTotal,
  lineUnitInfo,
  lineWarnings,
  needsFactor,
  packFactor,
  reasonLabel,
  startingFactor,
  unitsFor,
  baseUnitFor,
  type IngredientUnitInfoById,
} from '../lib/invoiceReview'
import type { IngredientSuggestion, ReviewLine } from '../types/invoiceImport'

const labelClass = 'text-[11px] font-medium tracking-wide text-neutral-500 uppercase'

/**
 * One line of the invoice in the review (ADR 0049): what the invoice says,
 * the ingredient it becomes (suggested, never hidden), quantity, unit and
 * cost. Missing things in red, odd things in amber.
 */
export function ReviewLineCard({
  line,
  number,
  units,
  ingredients,
  ingredientOptions,
  canCreateIngredient,
  onChange,
  onRemove,
}: {
  line: ReviewLine
  number: number
  units: Unit[]
  ingredients: IngredientUnitInfoById
  ingredientOptions: ComboboxOption[]
  canCreateIngredient: boolean
  onChange: (patch: Partial<ReviewLine>) => void
  /** Only for a line the person added. */
  onRemove?: () => void
}) {
  const info = lineUnitInfo(line, units, ingredients)
  const problems = lineProblems(line, units, ingredients)
  const warnings = lineWarnings(line, units, ingredients)
  const allowedUnits = unitsFor(info, units)
  const asksFactor = needsFactor(line.unitCode, info, units)
  const chosenId = line.ingredient?.kind === 'existing' ? line.ingredient.id : null
  const otherSuggestions = line.suggestions.filter((s) => s.ingredientId !== chosenId)

  /** Choosing an ingredient also brings the unit it is usually bought in. */
  function chooseExisting(id: string, suggestion?: IngredientSuggestion) {
    const next = ingredients.get(id) ?? (suggestion ? { baseUnitCode: suggestion.baseUnitCode, baseUnitType: suggestion.baseUnitType, purchaseUnits: suggestion.purchaseUnits } : null)
    let unitCode = suggestion?.learnedUnitCode ?? line.unitCode
    const nextAllowed = unitsFor(next, units).map((u) => u.code)
    if (!unitCode || !nextAllowed.includes(unitCode)) unitCode = next?.baseUnitCode ?? unitCode
    onChange({ ingredient: { kind: 'existing', id }, unitCode, factor: startingFactor({ pack: line.pack, unitCode }, next, units) })
  }

  /** A new ingredient: named as the AI understood it, measured like its package. */
  function createNew(name: string) {
    const baseUnitCode = line.pack?.unitCode ?? baseUnitFor(line.unitCode, units)
    const unitCode = line.unitCode ?? baseUnitCode
    const base = units.find((u) => u.code === baseUnitCode)
    const info = base ? { baseUnitCode, baseUnitType: base.unitType, purchaseUnits: [] } : null
    onChange({ ingredient: { kind: 'new', name: name || line.genericName || line.text, baseUnitCode }, unitCode, factor: startingFactor({ pack: line.pack, unitCode }, info, units) })
  }
  const fromPack = asksFactor && line.factor !== null && line.factor === packFactor(line, info, units)

  const total = lineTotal(line)
  const ready = problems.length === 0

  return (
    <li
      className={clsx(
        'rounded-xl border p-3 sm:p-4',
        line.ignored ? 'border-neutral-800/60 bg-neutral-900/20 opacity-70' : ready ? 'border-neutral-800/60 bg-neutral-900/40' : 'border-amber-500/30 bg-amber-500/[0.03]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {line.added ? (
            <p className={labelClass}>Línea {number} · agregada por ti</p>
          ) : (
            <>
              <p className={labelClass}>Línea {number} · en la factura</p>
              <p className={clsx('mt-0.5 text-sm break-words', line.ignored ? 'text-neutral-500 line-through' : 'text-neutral-100')}>
                {line.text}
                {line.code && <span className="ml-1.5 text-xs text-neutral-500">({line.code})</span>}
              </p>
              {(line.genericName || line.pack) && !line.ignored && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {line.genericName && <>Leído como «{line.genericName}»</>}
                  {line.genericName && line.pack && ' · '}
                  {line.pack && <>cada unidad trae {line.pack.size.toLocaleString('es-CO')} {line.pack.unitCode}</>}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!line.ignored && (ready ? <CircleCheck size={16} className="text-emerald-400" aria-label="Lista" /> : <Badge tone="warning">Por completar</Badge>)}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
            >
              <Trash2 size={13} aria-hidden /> Quitar
            </button>
          ) : (
          <button
            type="button"
            onClick={() => onChange({ ignored: !line.ignored })}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            {line.ignored ? <RotateCcw size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
            {line.ignored ? 'Incluir' : 'Ignorar'}
          </button>
          )}
        </div>
      </div>

      {!line.ignored && (
        <div className="mt-3 space-y-3">
          {/* The ingredient */}
          <div className="space-y-1.5">
            <p className={labelClass}>Insumo</p>
            {line.ingredient?.kind === 'new' ? (
              <div className="space-y-2 rounded-lg border border-brasa-500/30 bg-brasa-500/5 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Nombre del insumo nuevo"
                    value={line.ingredient.name}
                    onChange={(e) => onChange({ ingredient: { ...(line.ingredient as { kind: 'new'; name: string; baseUnitCode: string }), name: e.target.value } })}
                    className="!mt-0 min-w-0 flex-1"
                  />
                  <Select
                    aria-label="Unidad base del insumo nuevo"
                    value={line.ingredient.baseUnitCode}
                    onChange={(e) => onChange({ ingredient: { kind: 'new', name: (line.ingredient as { name: string }).name, baseUnitCode: e.target.value }, factor: null })}
                    className="!mt-0 sm:w-36"
                  >
                    {units
                      .filter((u) => ['g', 'ml', 'unidad'].includes(u.code))
                      .map((u) => (
                        <option key={u.code} value={u.code}>
                          Se mide en {u.code}
                        </option>
                      ))}
                  </Select>
                </div>
                <p className="text-xs text-neutral-400">
                  Insumo nuevo: se crea al guardar. Si ya existe uno con ese nombre, se usa ese.{' '}
                  <button type="button" onClick={() => onChange({ ingredient: null })} className="font-medium text-brasa-400 hover:underline">
                    Elegir uno existente
                  </button>
                </p>
              </div>
            ) : (
              <Combobox
                aria-label={`Insumo de la línea ${number}`}
                value={chosenId ?? ''}
                onChange={(id) => (id ? chooseExisting(id, line.suggestions.find((s) => s.ingredientId === id)) : onChange({ ingredient: null }))}
                options={ingredientOptions}
                placeholder="Busca el insumo…"
                onCreateNew={canCreateIngredient ? createNew : undefined}
                createLabel={(q) => `Crear insumo «${q}»`}
              />
            )}
            {chosenId && line.suggestions[0]?.ingredientId === chosenId && (
              <p className="flex items-center gap-1 text-xs text-neutral-500">
                <Sparkles size={12} className="text-brasa-400" aria-hidden /> Sugerido: {reasonLabel(line.suggestions[0].reason, line.suggestions[0].score)}
              </p>
            )}
            {line.ingredient?.kind !== 'new' && (otherSuggestions.length > 0 || (!line.ingredient && canCreateIngredient)) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-neutral-500">{chosenId ? 'Otras opciones:' : 'Sugerencias:'}</span>
                {otherSuggestions.map((s) => (
                  <button
                    key={s.ingredientId}
                    type="button"
                    onClick={() => chooseExisting(s.ingredientId, s)}
                    className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:border-brasa-500/60 hover:bg-brasa-500/5"
                  >
                    {s.name} <span className="text-neutral-500">· {reasonLabel(s.reason, s.score)}</span>
                  </button>
                ))}
                {!line.ingredient && canCreateIngredient && (
                  <button
                    type="button"
                    onClick={() => createNew(line.text)}
                    className="rounded-full border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-brasa-500/60 hover:text-neutral-100"
                  >
                    + Crear insumo nuevo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quantity, unit, cost */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
            <label className="space-y-1">
              <span className={labelClass}>Cantidad</span>
              <NumberInput aria-label={`Cantidad de la línea ${number}`} value={line.quantity} onValueChange={(v) => onChange({ quantity: v })} decimals={3} min={0} className="!mt-0" />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Unidad</span>
              <Select
                aria-label={`Unidad de la línea ${number}`}
                value={line.unitCode ?? ''}
                onChange={(e) => {
                  const unitCode = e.target.value || null
                  onChange({ unitCode, factor: startingFactor({ pack: line.pack, unitCode }, info, units) })
                }}
                className="!mt-0"
              >
                <option value="">Elegir…</option>
                {allowedUnits.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </label>
            <label className="col-span-2 space-y-1 sm:col-span-1">
              <span className={labelClass}>Costo por {line.unitCode ?? 'unidad'}</span>
              <CurrencyInput aria-label={`Costo de la línea ${number}`} value={line.unitCost} onValueChange={(v) => onChange({ unitCost: v })} decimals={2} className="!mt-0" />
            </label>
            <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
              <span className={labelClass}>Total</span>
              <p className="text-sm font-semibold text-neutral-100 tabular-nums sm:py-2.5">{formatMoney(total, { decimals: 'auto' })}</p>
            </div>
          </div>

          {asksFactor && (
            <label className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm text-neutral-200">
              ¿Cuántos {info?.baseUnitCode} trae 1 {line.unitCode}?
              <NumberInput
                aria-label={`Cuántos ${info?.baseUnitCode} trae 1 ${line.unitCode}`}
                value={line.factor}
                onValueChange={(v) => onChange({ factor: v })}
                decimals={3}
                min={0}
                unit={info?.baseUnitCode}
                className="!mt-0 w-36"
              />
              <span className="text-xs text-neutral-400">
                {fromPack ? 'Lo dice la factura; revísalo. ' : ''}Se guarda en el insumo para las próximas compras.
              </span>
            </label>
          )}
          {!asksFactor && line.unitCode && info && line.unitCode !== info.baseUnitCode && knownFactor(line.unitCode, info, units) && (
            <p className="text-xs text-neutral-500">
              1 {line.unitCode} = {knownFactor(line.unitCode, info, units)?.toLocaleString('es-CO')} {info.baseUnitCode}
            </p>
          )}

          {(problems.length > 0 || warnings.length > 0) && (
            <ul className="space-y-0.5 text-xs">
              {problems.map((p) => (
                <li key={p} className="text-red-400">
                  • {p}
                </li>
              ))}
              {warnings.map((w) => (
                <li key={w} className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle size={12} aria-hidden /> {w}
                </li>
              ))}
            </ul>
          )}

          {!line.added && (
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" checked={line.remember} onChange={(e) => onChange({ remember: e.target.checked })} className="accent-brasa-500" />
            Recordar esta asociación para las próximas facturas de este proveedor
          </label>
          )}
        </div>
      )}
    </li>
  )
}
