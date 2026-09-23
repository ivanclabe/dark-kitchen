import { describe, expect, it } from 'vitest'
import { dayHoursError, describeStatus, hoursForDate, isOvernight, kitchenStatus, weekDayOf, type KitchenSchedule } from './schedule'

// 2026-09-21 es lunes. Todas las fechas en hora local, igual que la app.
const at = (date: string, time: string) => new Date(`${date}T${time}:00`)

const weekdays11to22: KitchenSchedule = {
  weekly: {
    LUNES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' },
    MARTES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' },
    MIERCOLES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' },
    JUEVES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' },
    VIERNES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' },
    SABADO: { isOpen: false, opensAt: null, closesAt: null },
    DOMINGO: { isOpen: false, opensAt: null, closesAt: null },
  },
  exceptions: [],
}

describe('weekDayOf', () => {
  it('mapea getDay (domingo = 0) al enum ISO de la base', () => {
    expect(weekDayOf(at('2026-09-21', '12:00'))).toBe('LUNES')
    expect(weekDayOf(at('2026-09-27', '12:00'))).toBe('DOMINGO')
  })
})

describe('kitchenStatus', () => {
  it('sin horario configurado no afirma abierta ni cerrada', () => {
    expect(kitchenStatus({ weekly: {}, exceptions: [] }, at('2026-09-21', '12:00'))).toEqual({ state: 'unconfigured' })
  })

  it('abierta dentro del turno del día', () => {
    const status = kitchenStatus(weekdays11to22, at('2026-09-21', '12:30'))
    expect(status.state).toBe('open')
    if (status.state === 'open') expect(status.closesAt).toEqual(at('2026-09-21', '22:00'))
  })

  it('cerrada antes de abrir: abre hoy', () => {
    const status = kitchenStatus(weekdays11to22, at('2026-09-21', '08:00'))
    expect(status.state).toBe('closed')
    if (status.state === 'closed') expect(status.opensAt).toEqual(at('2026-09-21', '11:00'))
  })

  it('la hora de cierre ya cuenta como cerrada', () => {
    expect(kitchenStatus(weekdays11to22, at('2026-09-21', '22:00')).state).toBe('closed')
  })

  it('el viernes de noche salta el fin de semana cerrado hasta el lunes', () => {
    const status = kitchenStatus(weekdays11to22, at('2026-09-25', '23:00'))
    expect(status.state).toBe('closed')
    if (status.state === 'closed') expect(status.opensAt).toEqual(at('2026-09-28', '11:00'))
  })

  it('un turno que cruza la medianoche sigue abierto después de las 00:00', () => {
    const lateNight: KitchenSchedule = { weekly: { LUNES: { isOpen: true, opensAt: '18:00', closesAt: '02:00' } }, exceptions: [] }
    const status = kitchenStatus(lateNight, at('2026-09-22', '01:30'))
    expect(status.state).toBe('open')
    if (status.state === 'open') expect(status.closesAt).toEqual(at('2026-09-22', '02:00'))
    expect(kitchenStatus(lateNight, at('2026-09-22', '02:30')).state).toBe('closed')
  })

  it('una excepción de cierre gana sobre el horario semanal', () => {
    const holiday: KitchenSchedule = {
      ...weekdays11to22,
      exceptions: [{ date: '2026-09-21', isOpen: false, opensAt: null, closesAt: null, note: 'Festivo' }],
    }
    const status = kitchenStatus(holiday, at('2026-09-21', '12:00'))
    expect(status.state).toBe('closed')
    if (status.state === 'closed') {
      expect(status.note).toBe('Festivo')
      expect(status.opensAt).toEqual(at('2026-09-22', '11:00'))
    }
  })

  it('una excepción de horario especial abre aunque la plantilla diga cerrado', () => {
    const specialSunday: KitchenSchedule = {
      ...weekdays11to22,
      exceptions: [{ date: '2026-09-27', isOpen: true, opensAt: '12:00', closesAt: '18:00', note: 'Evento' }],
    }
    expect(kitchenStatus(specialSunday, at('2026-09-27', '13:00')).state).toBe('open')
  })

  it('sin ninguna apertura en dos semanas: cerrada sin próxima apertura', () => {
    const allClosed: KitchenSchedule = { weekly: { LUNES: { isOpen: false, opensAt: null, closesAt: null } }, exceptions: [] }
    expect(kitchenStatus(allClosed, at('2026-09-21', '12:00'))).toEqual({ state: 'closed', opensAt: null, note: null })
  })
})

describe('hoursForDate', () => {
  it('un día sin fila en la plantilla cuenta como cerrado', () => {
    const onlyMonday: KitchenSchedule = { weekly: { LUNES: { isOpen: true, opensAt: '11:00', closesAt: '22:00' } }, exceptions: [] }
    expect(hoursForDate(onlyMonday, '2026-09-22').isOpen).toBe(false)
  })
})

describe('describeStatus', () => {
  const now = at('2026-09-21', '12:00')

  it('abierta hoy', () => {
    expect(describeStatus({ state: 'open', closesAt: at('2026-09-21', '22:00'), note: null }, now)).toBe('Abierta · cierra a las 22:00')
  })

  it('abierta con cierre pasada la medianoche', () => {
    expect(describeStatus({ state: 'open', closesAt: at('2026-09-22', '02:00'), note: null }, now)).toBe('Abierta · cierra mañana a las 02:00')
  })

  it('cerrada, abre mañana', () => {
    expect(describeStatus({ state: 'closed', opensAt: at('2026-09-22', '11:00'), note: null }, now)).toBe('Cerrada · abre mañana a las 11:00')
  })

  it('cerrada, abre otro día de la semana', () => {
    expect(describeStatus({ state: 'closed', opensAt: at('2026-09-24', '11:00'), note: null }, now)).toBe('Cerrada · abre el jueves a las 11:00')
  })
})

describe('dayHoursError / isOvernight', () => {
  it('un día cerrado nunca es inválido', () => {
    expect(dayHoursError({ isOpen: false, opensAt: null, closesAt: null })).toBeNull()
  })
  it('abierto sin horas o con horas iguales es inválido', () => {
    expect(dayHoursError({ isOpen: true, opensAt: null, closesAt: '22:00' })).not.toBeNull()
    expect(dayHoursError({ isOpen: true, opensAt: '11:00', closesAt: '11:00' })).not.toBeNull()
  })
  it('detecta el turno que cruza la medianoche', () => {
    expect(isOvernight({ isOpen: true, opensAt: '18:00', closesAt: '02:00' })).toBe(true)
    expect(isOvernight({ isOpen: true, opensAt: '11:00', closesAt: '22:00' })).toBe(false)
  })
})
