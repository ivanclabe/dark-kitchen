# ADR 0017: Comandos de voz para todo el flujo del pedido y por plato

## Estado
**Propuesta (2026-09-30), pendiente de aprobación.** Una vez aprobada, se ejecuta completa (sección 8) sin más aprobaciones. Si apruebas sin comentarios, cada decisión de la sección 7 toma su recomendación. El código nuevo va en inglés y el manual no se toca.

**Problema reportado:** «Oye Quanela, pedido 1015 en ruta» no funciona: no reconoce «ruta».

---

## 1. Auditoría (2026-09-30)

### 1.1 Dónde está el fallo
**El detector «Oye Quanela» (ADR 0016) funciona.** Solo decide si se dijo la frase y abre 5 s de escucha. Lo que se dice después pasa por otras tres piezas, y ahí está el problema:

| Pieza | Qué hace hoy | Resultado con «pedido 1015 en ruta» |
|---|---|---|
| Reconocimiento del navegador | Transcribe lo que oye | Entrega bien «pedido 1015 en ruta» |
| Reconocimiento sin internet (Vosk, ADR 0015) | Solo acepta las palabras de `commandGrammar.ts` | «ruta» no está en su vocabulario, así que la cambia por otra palabra o la descarta |
| Intérprete (`commandParser.ts`) | Busca un número de 4 cifras y **una de 6 acciones** | «en ruta» no es ninguna acción, así que responde «No entendí el comando» |
| Motor (`useVoiceCommandEngine.ts`) | Solo recibe los pedidos de **cocina** (Confirmado, En preparación, Listo) | Aunque se entendiera, un pedido En ruta o Nuevo no aparece en su lista |

### 1.2 Qué entiende hoy la voz frente al tablero

| Estado del tablero (columna) | Botón o arrastre | Por voz hoy |
|---|---|---|
| Nuevo → Confirmado (reserva inventario) | «Confirmar» | ✗ Responde «ya está confirmado» |
| Confirmado → En preparación | «Iniciar» | ✓ «en preparación», «iniciar», «empezar» |
| En preparación → Listo | «Marcar listo» | ✓ «listo», «terminado» |
| Listo → **En ruta** (despachar, con domiciliario) | «Despachar» y elegir domiciliario | ✗ **Falta** |
| En ruta → Entregado | «Entregar» | ✗ **Falta** |
| Retroceder (Listo → Preparación, Preparación → Cola) | «Retroceder» | ✗ **Falta** |
| Un **plato** a En preparación o Listo | En el detalle del pedido, por plato | ✗ **Falta**: la voz mueve todos los platos del pedido a la vez |
| Prioridad, cancelar | Botones | ✓ (cancelar está bloqueado con Vosk por seguridad) |

**Conclusión.** La voz se diseñó solo para el tramo de cocina y quedó atrás del tablero, que ya maneja el flujo completo: Nuevo → Confirmado → En preparación → Listo → En ruta → Entregado, con acciones por plato.

### 1.3 Un segundo riesgo: decirlo todo seguido
Quien dice «Oye Quanela, pedido 1015…» sin pausa puede perder el comienzo del comando. Entre la detección y el reconocimiento pasan:
- el tono (0,22 s);
- el arranque del reconocedor (0,3–1 s en el navegador).

En ese tiempo se pierde «pedido mil…».

## 2. Diseño

### 2.1 La voz dice el estado de destino; el tablero decide la acción
Hoy el intérprete tiene su propia lista de acciones. La propuesta es que **reconozca el estado de destino** y que la acción la decida la misma regla que usan los botones y el arrastre: `transitionAction(desde, hacia)` en `kanban/transitions.ts`. Así la voz nunca puede hacer algo que el tablero no permita, y lo que se agregue al tablero sirve también para la voz.

**Vocabulario por estado** (se aceptan variantes con y sin tilde, en masculino y en femenino):

| Destino | Palabras | Acción según el estado actual |
|---|---|---|
| Confirmado / en cola | «confirmar», «confirmado», «en cola», «a la cola» | Nuevo → confirmar (reserva inventario). En preparación → retroceder a la cola. |
| En preparación | «en preparación», «preparando», «iniciar», «empezar», «marchar», «marchando» | Confirmado → iniciar. Listo → retroceder a preparación. |
| Listo | «listo», «lista», «terminado», «terminada» | Confirmado o En preparación → marcar listo |
| **En ruta** | «en ruta», «despachar», «despachado», «en camino», «salió», «enviado» | Listo → despachar (sección 2.3) |
| **Entregado** | «entregado», «entregada», «entregar», «llegó» | En ruta → entregar |
| Cancelado | «cancelar», «cancelado» (se mantiene el bloqueo con Vosk) | Cualquier estado activo → cancelar |
| Prioridad | Igual que hoy | Igual que hoy |

**Si la transición no existe** (por ejemplo, «pedido 1015 entregado» cuando el pedido está En preparación), responde con el estado real: «El pedido 1015 está en preparación; primero debe salir en ruta.» No ejecuta nada.

### 2.2 Todo el flujo, no solo la cocina
El motor de voz pasa a recibir **todos los pedidos de hoy en el tablero** (Nuevo a En ruta), no solo Confirmado, En preparación y Listo. Las alertas de pedido nuevo y la vista de tiempos (SLA) siguen igual.

### 2.3 En ruta: el domiciliario
Despachar exige asignar un domiciliario (`dk_dispatch_order`). Hay tres casos:

1. **Con nombre:** «pedido 1015 en ruta con Carlos». Se busca entre los domiciliarios activos por nombre o por la primera palabra del nombre. Si coincide exactamente uno, despacha.
2. **Sin nombre y con un solo domiciliario activo:** despacha con ese y lo dice: «Pedido 1015 en ruta con Carlos».
3. **Sin nombre y con varios, o el nombre no coincide:** abre en pantalla el diálogo *Despachar pedido #1015* y responde por voz: «¿Con qué domiciliario?». Se elige con un toque.

### 2.4 Platos
«Pedido 1015, la hamburguesa lista» y «pedido 1015 salchipapa en preparación» mueven **solo ese plato**, con la misma función que el detalle del pedido (`dk_advance_kitchen_item` / `dk_revert_kitchen_item`).

- **Cómo se reconoce el plato:** se compara con los platos **de ese pedido**, ignorando tildes, plurales y artículos. Basta con una palabra distintiva («hamburguesa», «alitas»).
- **Si hay varias unidades o varios platos que coinciden** («dos hamburguesas»), mueve todos los que coinciden. Si la coincidencia es ambigua entre platos distintos, pregunta: «¿Cuál plato?».
- **Si no se nombra plato,** se mueve el pedido completo, como hoy.
- **Cuando todos los platos quedan listos,** el pedido pasa a Listo solo, como ya ocurre en la base.

### 2.5 Vosk (sin internet)
La gramática deja de ser fija. Se arma **al empezar cada escucha** con:
- las palabras de la sección 2.1;
- las palabras de los **platos de los pedidos de hoy**;
- los **nombres de los domiciliarios activos**.

Vosk solo reconoce lo que está en su vocabulario, así que esto lo mantiene preciso. Las palabras que su modelo no conoce se ignoran sin romper nada.

### 2.6 Decirlo todo seguido
- **Arranque inmediato.** El reconocimiento arranca **en el mismo instante** de la detección, y el tono suena a la vez, no antes.
- **Con Vosk no se pierde nada.** El detector ya tiene el audio a 16 kHz, así que se le entrega al reconocedor lo que se dijo desde la detección.
- **Con el navegador** no se le puede pasar audio grabado. La sección 7 decide qué hacer.
- **Pista en pantalla:** «Di "Oye Quanela", espera el tono y di el comando.»

### 2.7 Respuestas
Siguen el formato de la ADR 0014: un texto corto en pantalla y una frase natural hablada.

| Caso | Respuesta |
|---|---|
| Pedido despachado | «Pedido 1015 en ruta con Carlos.» |
| Pedido entregado | «Pedido 1015 entregado.» |
| Un plato listo | «Hamburguesa del 1015, lista.» Si era el último, agrega «Pedido completo.» |
| Transición imposible | «El 1015 está en preparación.» |

## 3. Seguridad
- **Permisos:** cada acción comprueba antes el mismo permiso que el botón (`canPerform`), y la base lo vuelve a validar. Si falta, responde: «Tu rol no puede despachar pedidos.»
- **Sin ambigüedad:** con más de un número de pedido, más de un destino o un plato dudoso, **no se ejecuta nada**; se pregunta o se responde «No entendí».
- **Vosk:** cancelar por voz sigue bloqueado. **Despachar a otro pedido** por un número mal oído se deshace fácil, así que se permite. La respuesta hablada repite el número y el domiciliario.
- **Confirmar un pedido Nuevo** reserva inventario y puede fallar por falta de stock. Se ejecuta con la misma función que el botón, y el error se dice en voz.

## 4. Pruebas
- **Intérprete:** cada estado y cada sinónimo; números en cifras y en palabras; con y sin «pedido»; con plato; con domiciliario; frases ambiguas.
- **Transiciones:** tabla completa (desde → hacia) contra `transitionAction`, igual a la de los botones.
- **Motor:**
  - despachar con nombre, con un solo domiciliario y con varios (abre el diálogo);
  - entregar;
  - retroceder;
  - un plato y el último plato;
  - permiso denegado.
- **Gramática de Vosk:** incluye los platos del día y los domiciliarios; cada comando se puede decir solo con palabras de la gramática.
- **Navegador:** «Probar» en ajustes y comando de texto en Cocina con los casos anteriores.
- **Regresión:** todas las suites, `tsc`, `oxlint` y `build`.

## 5. Metas
- «Pedido 1015 en ruta» funciona con los dos motores.
- Todas las transiciones del tablero se pueden decir por voz.
- Un plato se puede mover por su nombre.
- Ninguna frase ambigua ejecuta algo.

## 6. Riesgos
| Riesgo | Mitigación |
|---|---|
| Nombres de platos largos o raros («bandeja paisa especial») | Basta con una palabra distintiva; si hay duda, se pregunta |
| Dos domiciliarios con el mismo nombre | Se pide elegir en pantalla |
| Más palabras en la gramática de Vosk, más confusiones | Solo se agregan los platos del día y los domiciliarios activos |
| El navegador pierde el comienzo cuando se dice todo seguido | Arranque inmediato, pista en pantalla y la decisión D4 |

## 7. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Modelo del intérprete | **Estado de destino y `transitionAction`**: una sola regla para botones, arrastre y voz |
| **D2** | «En ruta» sin nombre y con varios domiciliarios | **Abrir el diálogo de despacho** y preguntar por voz |
| **D3** | Confirmar un pedido Nuevo por voz | **Permitirlo**: misma función y mismo permiso que el botón |
| **D4** | Frase seguida con el motor del navegador | **Arranque inmediato y pista en pantalla.** Si en la cocina sigue fallando, pasar manos libres a Vosk por defecto, porque recibe el audio completo |
| **D5** | Plato ambiguo | **Preguntar**; nunca adivinar |

## 8. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Intérprete: estados de destino, sinónimos, plato y domiciliario (pruebas primero) |
| 2 | Motor: pedidos de todo el flujo, `transitionAction`, despacho, entrega, retroceso y plato; respuestas |
| 3 | Gramática dinámica de Vosk; arranque inmediato y audio desde la detección para Vosk |
| 4 | «Probar» en ajustes y pista en Cocina |
| 5 | Validación completa y verificación en el navegador |
| 6 | Documentación: esta ADR con resultados, ADR 0015 y 0016 con una referencia, y la arquitectura (el manual no) |
