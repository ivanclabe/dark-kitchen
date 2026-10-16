import { useSuppliers } from '@/modules/supply/hooks/useSuppliers'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { Drawer } from '@/shared/ui/Drawer'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney, todayStr } from '@/shared/utils/format'
import { CalendarRange, Plus, Repeat, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useCreateCategory, useCreateExpense, useObligations, useRecurring, useSaveRecurring } from '../hooks'
import { STATUS_LABEL, STATUS_TONE } from '../lib/finance'
import { PAYMENT_METHODS, type PaymentMethod, type RecurringObligation } from '../types'

/** Expenses (ADR 0051, D1, D7): they count in profitability on their date or period, not when paid. */
export function ExpensesTab() {
  const { can } = useActiveKitchen()
  const expenses = useObligations({ kind: 'expense' })
  const recurring = useRecurring()
  const categories = useCategories()
  const [creating, setCreating] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringObligation | 'new' | null>(null)
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? ''
  const recent = useMemo(() => [...(expenses.data ?? [])].sort((a, b) => b.accrualDate.localeCompare(a.accrualDate)).slice(0, 60), [expenses.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-400">Arriendo, servicios, gas, empaques, publicidad… Lo que compras para cocinar va en Compras, no aquí.</p>
        {can('finance.manage') && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Registrar gasto
          </Button>
        )}
      </div>

      <Card
        title="Gastos fijos"
        icon={Repeat}
        description="Se crean solos cada mes, una sola vez (por ejemplo, el arriendo el día 5)."
        action={
          can('finance.manage') && (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditingRecurring('new')}>
              Nuevo gasto fijo
            </Button>
          )
        }
      >
        {recurring.isLoading ? (
          <LoadingState variant="inline" label="Cargando…" />
        ) : (recurring.data ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">Sin gastos fijos todavía.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {(recurring.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-100">
                    {r.description} {!r.active && <Badge tone="neutral">Pausado</Badge>} {r.variableAmount && <Badge tone="info">Monto variable</Badge>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {catName(r.categoryId)} · cada mes, vence el día {r.dayOfMonth}
                    {r.payeeName && ` · ${r.payeeName}`}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-neutral-100">{formatMoney(r.amount)}</span>
                {can('finance.manage') && (
                  <Button variant="link" size="sm" onClick={() => setEditingRecurring(r)}>
                    Editar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Gastos registrados" icon={Receipt} padding={false}>
        {expenses.isLoading ? (
          <LoadingState variant="block" label="Cargando gastos…" />
        ) : recent.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin gastos todavía" description="Registra el arriendo, los servicios y lo demás para que la utilidad sea real." compact />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-100">
                    {o.description} <Badge tone="neutral">{o.categoryName}</Badge> <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {o.periodStart ? `del ${formatDate(o.periodStart)} al ${formatDate(o.periodEnd!)}` : formatDate(o.accrualDate)}
                    {o.payee && ` · ${o.payee}`}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-neutral-100">{formatMoney(o.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {creating && <ExpenseDrawer onClose={() => setCreating(false)} />}
      {editingRecurring && <RecurringDrawer recurring={editingRecurring === 'new' ? null : editingRecurring} onClose={() => setEditingRecurring(null)} />}
    </div>
  )
}

function CategorySelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const categories = useCategories()
  const createCategory = useCreateCategory()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  return (
    <div className="space-y-1.5">
      <Select aria-label="Categoría" value={value} onChange={(e) => onChange(e.target.value)} className="!mt-0">
        <option value="">Elegir…</option>
        {(categories.data ?? [])
          .filter((c) => c.active)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </Select>
      {adding ? (
        <div className="flex gap-2">
          <Input aria-label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} className="!mt-0" placeholder="Ej. Software" />
          <Button
            variant="secondary"
            size="sm"
            disabled={name.trim().length < 2}
            loading={createCategory.isPending}
            onClick={() =>
              void createCategory.mutateAsync(name).then((c) => {
                onChange(c.id)
                setAdding(false)
                setName('')
              })
            }
          >
            Crear
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-brasa-400 hover:underline">
          + Nueva categoría
        </button>
      )}
    </div>
  )
}

/** One expense, optionally for a period (rent of a month is spread over its days) and optionally already paid. */
function ExpenseDrawer({ onClose }: { onClose: () => void }) {
  const { can } = useActiveKitchen()
  const { data: suppliers } = useSuppliers()
  const create = useCreateExpense()
  const { show } = useToast()
  const today = todayStr()
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [accrualDate, setAccrualDate] = useState(today)
  const [hasPeriod, setHasPeriod] = useState(false)
  const [periodStart, setPeriodStart] = useState(today.slice(0, 8) + '01')
  const [periodEnd, setPeriodEnd] = useState(today)
  const [dueDate, setDueDate] = useState(today)
  const [paidNow, setPaidNow] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('Efectivo')
  const [error, setError] = useState<string | null>(null)
  const invalid = !categoryId || description.trim().length < 2 || !amount || amount <= 0 || (hasPeriod && periodEnd < periodStart)

  async function submit() {
    setError(null)
    try {
      await create.mutateAsync({
        categoryId,
        description: description.trim(),
        supplierId: supplierId || null,
        payeeName: supplierId ? null : payeeName.trim() || null,
        amount: amount!,
        accrualDate: hasPeriod ? periodStart : accrualDate,
        periodStart: hasPeriod ? periodStart : null,
        periodEnd: hasPeriod ? periodEnd : null,
        dueDate: paidNow ? (hasPeriod ? periodStart : accrualDate) : dueDate,
        payNow: paidNow ? { method } : null,
      })
      show(paidNow ? 'Gasto registrado y pagado.' : 'Gasto registrado: quedó en Por pagar.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el gasto'))
    }
  }

  return (
    <Drawer open onClose={onClose} title="Registrar gasto" subtitle="Cuenta en la rentabilidad en su fecha o periodo">
      <div className="space-y-4">
        <FormField label="Categoría" required>
          {() => <CategorySelect value={categoryId} onChange={setCategoryId} />}
        </FormField>
        <FormField label="Descripción" required>
          {(a11y) => <Input {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="Arriendo de octubre" />}
        </FormField>
        <FormGrid>
          <FormField label="Proveedor" hint="Si es uno de tus proveedores">
            {(a11y) => (
              <Select {...a11y} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Ninguno</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {!supplierId && (
            <FormField label="A quién se le paga">
              {(a11y) => <Input {...a11y} value={payeeName} onChange={(e) => setPayeeName(e.target.value)} maxLength={120} placeholder="Arrendador, empresa de energía…" />}
            </FormField>
          )}
          <FormField label="Valor" required>
            {(a11y) => <CurrencyInput {...a11y} value={amount} onValueChange={setAmount} />}
          </FormField>
          {!hasPeriod && (
            <FormField label="Fecha del gasto" required>
              {(a11y) => <Input {...a11y} type="date" value={accrualDate} onChange={(e) => setAccrualDate(e.target.value)} />}
            </FormField>
          )}
        </FormGrid>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
          <span className="flex items-center gap-2">
            <CalendarRange size={15} className="text-neutral-500" aria-hidden /> Corresponde a un periodo (se reparte por días)
          </span>
          <Switch checked={hasPeriod} onChange={setHasPeriod} label="Corresponde a un periodo" />
        </label>
        {hasPeriod && (
          <FormGrid>
            <FormField label="Desde" required>
              {(a11y) => <Input {...a11y} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />}
            </FormField>
            <FormField label="Hasta" required>
              {(a11y) => <Input {...a11y} type="date" value={periodEnd} min={periodStart} onChange={(e) => setPeriodEnd(e.target.value)} />}
            </FormField>
          </FormGrid>
        )}

        {can('finance.pay') && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
            Ya lo pagué
            <Switch checked={paidNow} onChange={setPaidNow} label="Ya lo pagué" />
          </label>
        )}
        {paidNow ? (
          <FormField label="Cómo se pagó">
            {(a11y) => (
              <Select {...a11y} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            )}
          </FormField>
        ) : (
          <FormField label="Vence" required hint="Queda en Por pagar hasta que lo pagues">
            {(a11y) => <Input {...a11y} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
          </FormField>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button variant="primary" className="w-full" onClick={() => void submit()} loading={create.isPending} disabled={invalid}>
          Registrar gasto
        </Button>
      </div>
    </Drawer>
  )
}

function RecurringDrawer({ recurring, onClose }: { recurring: RecurringObligation | null; onClose: () => void }) {
  const save = useSaveRecurring()
  const { show } = useToast()
  const [categoryId, setCategoryId] = useState(recurring?.categoryId ?? '')
  const [description, setDescription] = useState(recurring?.description ?? '')
  const [payeeName, setPayeeName] = useState(recurring?.payeeName ?? '')
  const [amount, setAmount] = useState<number | null>(recurring?.amount ?? null)
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(recurring?.dayOfMonth ?? 5)
  const [active, setActive] = useState(recurring?.active ?? true)
  const [variableAmount, setVariableAmount] = useState(recurring?.variableAmount ?? false)
  const [error, setError] = useState<string | null>(null)
  const invalid = !categoryId || description.trim().length < 2 || !amount || amount <= 0 || !dayOfMonth || dayOfMonth < 1 || dayOfMonth > 28

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({ id: recurring?.id ?? null, categoryId, description: description.trim(), payeeName: payeeName.trim() || null, amount: amount!, dayOfMonth: dayOfMonth!, active, variableAmount })
      show(recurring ? 'Gasto fijo actualizado.' : 'Gasto fijo creado: el de este mes ya está en Por pagar.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar'))
    }
  }

  return (
    <Drawer open onClose={onClose} title={recurring ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} subtitle="Cada mes se crea una obligación, una sola vez">
      <div className="space-y-4">
        <FormField label="Categoría" required>
          {() => <CategorySelect value={categoryId} onChange={setCategoryId} />}
        </FormField>
        <FormField label="Descripción" required>
          {(a11y) => <Input {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="Arriendo del local" />}
        </FormField>
        <FormField label="A quién se le paga">
          {(a11y) => <Input {...a11y} value={payeeName} onChange={(e) => setPayeeName(e.target.value)} maxLength={120} />}
        </FormField>
        <FormGrid>
          <FormField label={variableAmount ? 'Valor de referencia' : 'Valor mensual'} required>
            {(a11y) => <CurrencyInput {...a11y} value={amount} onValueChange={setAmount} />}
          </FormField>
          <FormField label="Vence el día" required hint="Del 1 al 28">
            {(a11y) => <NumberInput {...a11y} value={dayOfMonth} onValueChange={setDayOfMonth} min={1} max={28} />}
          </FormField>
        </FormGrid>
        {/* ADR 0063: power or gas change every month; the month waits for the real amount before it can be paid. */}
        <label className="flex items-start justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
          <span>
            Monto variable
            <span className="block text-xs text-neutral-500">Cada mes nace con el valor de referencia y se confirma el real antes de pagarlo.</span>
          </span>
          <Switch checked={variableAmount} onChange={setVariableAmount} label="Monto variable" />
        </label>
        {recurring && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
            Activo
            <Switch checked={active} onChange={setActive} label="Gasto fijo activo" />
          </label>
        )}
        <p className="text-xs text-neutral-500">Cambiar el valor aplica desde el próximo mes; los meses ya creados no cambian.</p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button variant="primary" className="w-full" onClick={() => void submit()} loading={save.isPending} disabled={invalid}>
          Guardar
        </Button>
      </div>
    </Drawer>
  )
}
