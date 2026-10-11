---
id: payroll
section: finance
title: Nómina
summary: En Finanzas → Nómina configuras cómo se le paga a cada persona (por hora o salario mensual) y liquidas la nómina de un periodo con las horas reales de los turnos.
audience: [owner, admin]
permissions: [finance.payroll]
appPath: /finance/payroll
questions:
  - ¿Cómo liquido la nómina?
  - ¿Cómo registro cuánto gana cada empleado?
  - ¿Quanela calcula las horas trabajadas?
  - ¿Quién puede ver los salarios?
keywords: [nómina, salario, sueldo, pago por hora, horas trabajadas, liquidar, quincena, empleados]
related: [shifts, payables, profitability]
updated: 2026-10-11
order: 4
---

## Cómo se le paga a cada persona

En **Cómo se le paga a cada persona**, toca **Configurar** (o **Cambiar**) junto a cada quien:

- **Por hora:** el valor de la hora. La nómina usa las horas reales de sus turnos.
- **Salario mensual:** el salario del mes. La nómina toma la parte de los días del periodo.

Elige **Desde** cuándo rige: un cambio no altera lo anterior.

## Liquidar

1. En **Liquidar nómina**, elige **Desde** y **Hasta** (por ejemplo, la quincena) y toca **Calcular**.
2. Quanela propone, por persona, las **horas** trabajadas (de la entrada a la salida, menos el descanso) × su tarifa, o el salario proporcional.
3. Ajusta **A pagar** si hay extras, auxilios o deducciones, con una nota.
4. Elige cuándo **Se paga** y toca **Liquidar**: queda una obligación por persona en **Por pagar**.

> **Bueno saber:** la nómina cuenta en la rentabilidad en su periodo, repartida por días. Pagarla no la vuelve a contar.

> **Cuidado:** Quanela no calcula prestaciones sociales ni seguridad social: súmalas en la nota o regístralas como gasto. Una misma persona no se liquida dos veces en el mismo periodo.

Los salarios solo los ve quien tiene el permiso **Nómina** (ADMIN por defecto). El GERENTE ve el total de nómina en la rentabilidad, pero no lo de cada persona.
