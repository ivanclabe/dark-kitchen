import { Avatar } from '@/shared/avatars/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatMoney, todayStr } from '@/shared/utils/format'
import { Calculator, Lock, Users } from 'lucide-react'
import { useState } from 'react'
import { addDays } from '@/modules/insights/lib/periods'
import { getPayrollProposal } from '../api'
import { useLiquidatePayroll, useObligations, useSetMemberPay, useTeamPay } from '../hooks'
import { STATUS_LABEL } from '../lib/finance'
import type { PayrollProposalLine, TeamMemberPay } from '../types'

const payLabel = (m: Pick<TeamMemberPay, 'payType' | 'rate'>) =>
  m.payType === 'hourly' ? `${formatMoney(m.rate ?? 0)} por hora` : m.payType === 'monthly' ? `${formatMoney(m.rate ?? 0)} al mes` : 'Sin configurar'

/**
 * Payroll (ADR 0051, D6): how each person is paid, and the payroll of a
 * period proposed from the real hours of their shifts, edited by the person
 * and turned into one obligation per person. Reserved: finance.payroll.
 */
export function PayrollTab({ allowed }: { allowed: boolean }) {
  const team = useTeamPay(allowed)
  const payroll = useObligations({ kind: 'payroll' })
  const [editing, setEditing] = useState<TeamMemberPay | null>(null)
  if (!allowed) return <EmptyState mood={null} icon={Lock} title="Nómina reservada" description="Ver y liquidar la nómina necesita el permiso de nómina." />

  return (
    <div className="space-y-4">
      <Card title="Cómo se le paga a cada persona" icon={Users} description="Por hora (con las horas reales de sus turnos) o un salario mensual.">
        {team.isLoading ? (
          <LoadingState variant="inline" label="Cargando el equipo…" />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {(team.data ?? []).map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
                <Avatar avatarKey={m.avatarKey} seed={m.userId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-100">
                    {m.fullName} {!m.active && <span className="text-xs text-neutral-500">(inactivo)</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {m.roleName}
                    {m.effectiveFrom && ` · desde el ${formatDate(m.effectiveFrom)}`}
                  </p>
                </div>
                <span className={m.payType ? 'text-sm tabular-nums text-neutral-100' : 'text-sm text-amber-400'}>{payLabel(m)}</span>
                <Button variant="link" size="sm" onClick={() => setEditing(m)}>
                  {m.payType ? 'Cambiar' : 'Configurar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <LiquidateCard />

      <Card title="Nóminas liquidadas">
        {(payroll.data ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay nóminas liquidadas.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {[...(payroll.data ?? [])].sort((a, b) => b.accrualDate.localeCompare(a.accrualDate)).slice(0, 40).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-neutral-200">{o.description}</span>
                <span className="text-xs text-neutral-500">{STATUS_LABEL[o.status]}</span>
                <span className="tabular-nums text-neutral-100">{formatMoney(o.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <MemberPayModal member={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MemberPayModal({ member, onClose }: { member: TeamMemberPay; onClose: () => void }) {
  const save = useSetMemberPay()
  const { show } = useToast()
  const [payType, setPayType] = useState<'hourly' | 'monthly'>(member.payType ?? 'hourly')
  const [rate, setRate] = useState<number | null>(member.rate)
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr().slice(0, 8) + '01')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Pago de ${member.fullName}`}
      description="Un cambio rige desde la fecha que elijas; lo anterior queda en el historial."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!rate || rate <= 0}
            onClick={() =>
              void save.mutateAsync({ userId: member.userId, payType, rate: rate!, effectiveFrom }).then(
                () => {
                  show('Pago guardado.')
                  onClose()
                },
                (err: unknown) => setError(getErrorMessage(err, 'No se pudo guardar')),
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Cómo se le paga" required>
          {(a11y) => (
            <Select {...a11y} value={payType} onChange={(e) => setPayType(e.target.value as 'hourly' | 'monthly')}>
              <option value="hourly">Por hora</option>
              <option value="monthly">Salario mensual</option>
            </Select>
          )}
        </FormField>
        <FormField label={payType === 'hourly' ? 'Valor de la hora' : 'Salario del mes'} required>
          {(a11y) => <CurrencyInput {...a11y} value={rate} onValueChange={setRate} />}
        </FormField>
        <FormField label="Desde" required>
          {(a11y) => <Input {...a11y} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />}
        </FormField>
      </FormGrid>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** Propose → edit → create one payroll obligation per person. */
function LiquidateCard() {
  const liquidate = useLiquidatePayroll()
  const { show } = useToast()
  const today = todayStr()
  const [from, setFrom] = useState(addDays(today, -14))
  const [to, setTo] = useState(today)
  const [due, setDue] = useState(today)
  const [lines, setLines] = useState<PayrollProposalLine[] | null>(null)
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function propose() {
    setError(null)
    setLoading(true)
    try {
      const next = await getPayrollProposal(from, to)
      setLines(next)
      setAmounts(Object.fromEntries(next.map((l) => [l.userId, l.liquidated ? null : l.amount])))
      setNotes({})
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo calcular'))
    } finally {
      setLoading(false)
    }
  }

  const selected = (lines ?? []).filter((l) => !l.liquidated && (amounts[l.userId] ?? 0) > 0)
  const total = selected.reduce((sum, l) => sum + (amounts[l.userId] ?? 0), 0)

  return (
    <Card title="Liquidar nómina" icon={Calculator} description="Quanela propone con las horas reales de los turnos (entrada a salida, menos el descanso) o el salario proporcional. Ajusta lo que haga falta.">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Desde">{(a11y) => <Input {...a11y} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</FormField>
        <FormField label="Hasta">{(a11y) => <Input {...a11y} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</FormField>
        <Button variant="secondary" onClick={() => void propose()} loading={loading}>
          Calcular
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {lines && (
        <div className="mt-4 space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-neutral-500">Nadie tiene pago configurado ni horas en ese periodo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500">
                  <th className="pb-2 text-left font-normal">Persona</th>
                  <th className="pb-2 text-right font-normal">Horas</th>
                  <th className="pb-2 text-right font-normal">Propuesto</th>
                  <th className="pb-2 pl-3 text-left font-normal">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.userId} className="border-t border-neutral-800/60 align-top">
                    <td className="py-2 pr-2">
                      <span className="text-neutral-100">{l.name}</span>
                      <span className="block text-xs text-neutral-500">{l.liquidated ? 'Ya liquidada en este periodo' : payLabel({ payType: l.payType, rate: l.rate })}</span>
                      {/* ADR 0063: a shift without clock-out counts 0 hours; it is said, not hidden. */}
                      {l.openShifts > 0 && (
                        <span className="block text-xs text-amber-400">
                          {l.openShifts} {l.openShifts === 1 ? 'turno' : 'turnos'} sin salida (no suman horas): corrígelos en Personal → Horas
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-300">{l.hours.toLocaleString('es-CO')}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-300">{l.amount === null ? '—' : formatMoney(l.amount)}</td>
                    <td className="py-2 pl-3">
                      {l.liquidated ? (
                        <span className="text-xs text-neutral-500">—</span>
                      ) : (
                        <div className="space-y-1">
                          <CurrencyInput aria-label={`A pagar a ${l.name}`} value={amounts[l.userId] ?? null} onValueChange={(v) => setAmounts((a) => ({ ...a, [l.userId]: v }))} className="!mt-0" />
                          <Input
                            aria-label={`Nota de ${l.name}`}
                            placeholder="Extras, deducciones…"
                            value={notes[l.userId] ?? ''}
                            onChange={(e) => setNotes((n) => ({ ...n, [l.userId]: e.target.value }))}
                            className="!mt-0 text-xs"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selected.length > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-neutral-800/60 pt-3">
              <FormField label="Se paga el">{(a11y) => <Input {...a11y} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</FormField>
              <div className="text-right">
                <p className="text-xs text-neutral-500">{selected.length} persona(s)</p>
                <p className="text-lg font-semibold tabular-nums text-neutral-100">{formatMoney(total)}</p>
              </div>
              <Button
                variant="primary"
                loading={liquidate.isPending}
                onClick={() =>
                  void liquidate
                    .mutateAsync({ from, to, dueDate: due, lines: selected.map((l) => ({ userId: l.userId, amount: amounts[l.userId]!, note: notes[l.userId] || null })) })
                    .then(
                      (n) => {
                        show(`Nómina liquidada: ${n} obligación(es) en Por pagar.`)
                        setLines(null)
                      },
                      (err: unknown) => setError(getErrorMessage(err, 'No se pudo liquidar')),
                    )
                }
              >
                Liquidar
              </Button>
            </div>
          )}
          <p className="text-xs text-neutral-500">No calcula prestaciones sociales ni seguridad social: súmalas como nota o regístralas como gasto.</p>
        </div>
      )}
    </Card>
  )
}
