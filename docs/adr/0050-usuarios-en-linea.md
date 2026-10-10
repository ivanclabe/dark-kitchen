# ADR 0050: Usuarios en línea, en vivo en el encabezado

## Estado
**Aprobada e implementada (2026-10-10).** Falta verla en el navegador con dos usuarios (ver Validación).

**Pedido:** un indicador en vivo en el encabezado con cuántos usuarios están en línea en la app.

---

## 1. Auditoría
| Hoy | Qué significa |
|---|---|
| La app **no usa nada en tiempo real**: no hay canales ni Presence. La campana de notificaciones consulta cada 60 s | Es lo primero en vivo. Supabase Realtime ya está habilitado en el proyecto |
| El encabezado de escritorio tiene el contexto (cuenta · rol) a la izquierda, y Voz y Copilot a la derecha. El móvil tiene una barra propia con los mismos botones en pequeño | Hay lugar junto a Voz y Copilot, en las dos barras |
| La sesión ya conoce el perfil (nombre, avatar), la cuenta activa y el rol activo | Lo que se muestra de cada persona ya está en el navegador; no hace falta consultar la base |
| Todo se separa por **cuenta**: cada cuenta es un equipo con sus propios datos | «En línea» tiene sentido por cuenta |
| Cada pestaña abierta usa **una** conexión de Realtime (el cliente comparte un solo websocket para todos sus canales) | El límite de conexiones simultáneas del plan de Supabase (200 en Free, 500 en Pro) cuenta pestañas abiertas, no usuarios |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Qué cuenta | Las **personas** (no las pestañas ni los equipos) que tienen abierta **la cuenta activa** en este momento. Varias pestañas o un celular y un computador cuentan como una persona.<br>*Alternativa: toda la organización (todas sus cuentas). Más confuso, porque cada cuenta es un equipo distinto* |
| **D2** | Cómo | **Supabase Realtime Presence** en un canal **privado** por cuenta (`account:{id}:presence`). Una regla en `realtime.messages` deja entrar **solo a los miembros activos de esa cuenta**: nadie de otra cuenta ve ni aparece.<br>**Sin tablas nuevas y sin guardar nada**: la presencia vive mientras la app está abierta y desaparece sola unos segundos después de cerrar la pestaña o perder la conexión |
| **D3** | Qué comparte cada persona | Su nombre, su avatar, su rol activo y si está **activa** o **ausente** (la pestaña lleva más de 5 minutos oculta o sin uso).<br>**Nunca** en qué pantalla está, qué hace ni desde dónde se conecta |
| **D4** | Cómo se ve | En el encabezado, junto a Voz y Copilot: un punto verde con **«3 en línea»** (en el celular, el punto y el número). Al tocarlo se abre la lista: avatar, nombre y rol, con **Tú** primero y los ausentes en gris.<br>Si solo estás tú, dice **«Solo tú»**. Si se pierde la conexión, el punto se pone gris («Sin conexión en vivo») y se recupera solo |
| **D5** | Quién lo ve | **Todos los miembros de la cuenta** ven el número y la lista, como en cualquier herramienta de equipo.<br>*Alternativa: el número para todos, pero los nombres solo para quien puede ver el equipo (`team.view`)* |
| **D6** | Superadministradores y soporte | Solo cuentan y ven los **miembros** de la cuenta. Alguien de la plataforma que no es miembro no se conecta al canal: no aparece en la cuenta de un cliente |
| **D7** | Ayuda | Un párrafo en el artículo de la pantalla principal o del equipo, y las notas de versión. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_presence`: reglas en `realtime.messages` para leer y enviar presencia en `account:{id}:presence` solo si la persona es miembro activo de esa cuenta. Pruebas SQL |
| 2 · App | Hook `useAccountPresence` (unirse al canal de la cuenta activa, anunciarse, activo o ausente, reconectar, salir al cambiar de cuenta o cerrar sesión). La lógica pura de agrupar por persona, ordenar y contar va en `lib/` con pruebas. Componente `OnlineIndicator` en las dos barras del encabezado |
| 3 · Ayuda | Artículo y notas |
| — | **Validación:**<br>• **SQL:** un miembro entra al canal de su cuenta; alguien de otra cuenta, un miembro inactivo y un superadmin no miembro no entran.<br>• **Vitest:** varias pestañas = una persona, ausente, «Solo tú», orden, sin conexión.<br>• **Además:** `tsc`, `oxlint` y builds.<br>• **Navegador**, con tu sesión: dos ventanas con dos usuarios de prueba, ver cómo sube y baja el número |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Sentirse vigilado | Solo se ve «en línea» o «ausente»; nunca la pantalla, la actividad ni la ubicación. La ayuda lo explica |
| Límite de conexiones del plan de Supabase | Una conexión por pestaña. Con más de 200 pestañas abiertas a la vez hará falta el plan Pro |
| Un número que tarda en bajar | Supabase saca a quien se desconecta en unos segundos; al cerrar la pestaña se sale de inmediato |

## 5. Resultados (2026-10-10)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261010120000_dk_presence` (aplicada; era la única pendiente):<br>• `dk_presence_allowed(topic)`: canal `account:{id}:presence`, persona activa, cuenta y organización activas, y ser **miembro activo de la cuenta o superadministrador de su organización**. Quien entra solo como administrador de la plataforma no pasa;<br>• políticas `dk_presence_read` (select) y `dk_presence_track` (insert) en `realtime.messages`, solo para la extensión `presence` y solo para `authenticated` |
| 2 · App | `src/shared/presence/presence.ts` (pura): agrupar por persona, activa o ausente, orden con «tú» primero y luego activos, etiqueta «Solo tú» o «N en línea», ausente a los 5 minutos.<br>`useAccountPresence`: canal privado por cuenta con la persona como clave. Se anuncia al conectar y cuando cambian el nombre, el avatar, el rol o el estado. Solo comparte nombre, avatar, rol, estado y hora de entrada. Sale al cambiar de cuenta o cerrar.<br>`OnlineIndicator` en las dos barras del encabezado: punto verde, que late si hay más gente, con «N en línea» (en el celular, el número) y la lista con avatar, rol y ausentes; gris con «Sin conexión en vivo» si se cae |
| 3 · Ayuda | Sección «Quién está en línea» en `users-and-roles`, notas de versión y `dk-copilot` desplegada. El manual no se tocó |

**Validación:**
- SQL `presence` **12/12**:
  - la cocina entra a su cuenta;
  - la caja de B entra a B;
  - la dueña, superadministradora de la organización, entra a las dos;
  - nadie entra a la cuenta de otro;
  - un miembro inactivo no entra;
  - un canal con otro nombre, un texto inválido o una petición sin sesión no entran;
  - una cuenta desactivada cierra su canal;
  - las 2 políticas existen con la regla y ninguna es para anónimos.
- Comprobación directa contra `realtime.messages`, revertida: la cocina se anuncia en A; en B, rechazada (42501); la dueña, en B; la inactiva, rechazada; un *broadcast* en lugar de presencia, rechazado.
- Vitest **708**:
  - `presence.test`: pestañas = una persona, orden, rol de la última pestaña, basura ignorada, etiquetas y ausente a los 5 minutos;
  - `OnlineIndicator.test`: canal privado de la cuenta, qué comparte (sin pantalla ni actividad), la lista con «(tú)» y los ausentes, sin conexión y salir del canal.
- `tsc`, `oxlint` (13 avisos, los mismos) y los dos builds.
- **Primer uso real (2026-10-10):** la app se cayó con «cannot add `presence` callbacks … after `subscribe()`». Supabase devuelve el mismo canal para el mismo nombre, y había dos indicadores (escritorio y celular, uno oculto con CSS) más el doble montaje de React en desarrollo. Se corrigió con `presenceStore.ts`: **un solo canal por cuenta y persona**, fuera de React, compartido por todos los indicadores y contado por sus usuarios. Se cierra 1,5 s después del último y, si un canal del mismo nombre aún se está cerrando, espera a que termine. El hook usa `useSyncExternalStore`. Pruebas nuevas: dos indicadores bajo StrictMode comparten un canal (el canal simulado falla igual que Supabase si se agregan avisos después de suscribirse) y el cierre diferido. Vitest **709**.
- **Navegador: pendiente.** Hace falta tu sesión, y una segunda persona o ventana para ver subir y bajar el número.

