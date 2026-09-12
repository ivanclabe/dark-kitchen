# ADR 0003 — Modelo de unidades y conversión de empaques

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
Se necesita convertir entre unidades de compra (kg, caja, bolsa) y la unidad base en la que se mide el stock y se escriben las recetas (g, ml, unidad), sin que el inventario se transforme conceptualmente en "número de platos".

## Decisión
Dos niveles de conversión:

1. **Conversión genérica por tipo de unidad** (`dk_units.factor_to_base`): válida siempre, independiente del insumo (1 kg = 1000 g, 1 l = 1000 ml, 1 docena = 12 unidad).
2. **Conversión específica por insumo** (`dk_ingredient_purchase_units`): para empaques que no son una conversión universal (ej. "caja x 24" de un insumo concreto, cuyo "24" depende del producto, no de la unidad `caja` en general).

Las recetas siempre se expresan y consumen en la unidad base del insumo. El "número de platos teóricos" (stock ÷ consumo por receta) es siempre un cálculo derivado para reportes/alertas, nunca un estado persistido.

## Consecuencias
- (+) Cubre tanto conversiones estándar (kg/g) como empaques arbitrarios de proveedor, sin forzar un catálogo de unidades infinito.
- (+) El inventario permanece expresado en unidades físicas reales, evitando el anti-patrón "convertir todo a platos" que el negocio pidió explícitamente evitar.
- (−) Dos tablas de conversión en vez de una obliga a decidir, al registrar una compra, cuál aplica (se resuelve en la UI: primero se busca en `dk_ingredient_purchase_units`, si no existe se usa `dk_units`).
