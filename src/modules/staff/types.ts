/** Personal y Turnos (ADR 0020). People and roles come from the account's team; a shift only points to them. */
export interface StaffRole {
  id: string
  name: string
}

export interface StaffMember {
  userId: string
  fullName: string
  avatarKey: string | null
  active: boolean
  defaultRoleId: string | null
  roles: StaffRole[]
  /** The person is also a rider of the account (Despacho). */
  riderId: string | null
}

export interface Shift {
  id: string
  userId: string
  roleId: string
  startsAt: string
  endsAt: string
  breakMinutes: number
  notes: string | null
  status: 'scheduled' | 'cancelled'
  unplanned: boolean
  clockInAt: string | null
  clockOutAt: string | null
}

export interface ShiftInput {
  userId: string
  roleId: string
  startsAt: string
  endsAt: string
  breakMinutes: number
  notes?: string | null
}

export interface OnShift {
  shiftId: string
  userId: string
  fullName: string
  roleId: string
  roleName: string
  startsAt: string
  endsAt: string
  clockedIn: boolean
  riderId: string | null
}
