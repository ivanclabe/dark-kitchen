# ADR 0037: Centro de notificaciones (campana) y un «Necesita atención» más claro

## Estado
**Aprobada e implementada (2026-10-06).**

**Pedido:**
- Mejorar cómo se ven los avisos de Inicio.
- Agregar una **campana** junto al menú de usuario con **todas las notificaciones que genera la app**, en especial las de IA.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| Inicio muestra dos bloques: las **alertas de la cuenta** (`dk_account_alerts`, franjas de colores a todo el ancho) y **«Necesita atención»** (`attentionRows`) | Dos estilos para lo mismo. Las franjas rojas y amarillas a todo el ancho se ven pesadas. «Insumos bajo el mínimo» puede salir **dos veces** |
| «3 análisis de IA con error en 24 h» | Son **3 errores de Copilot** del fallo de `tool_choice` ya corregido (verificado en la base). La alerta cuenta Copilot como si fuera un análisis, aunque Copilot tiene su propio cupo y sus métricas en «IA y voz» |
| Los análisis de IA (`dk_ai_insights`: sugerencias de compra, perecederos, poco movimiento, sugerencias de cocina) guardan **ítems con prioridad, título, explicación y acción** | Solo se ven dentro de su pantalla, y solo si alguien la abre. Hoy hay 14 análisis de cocina en 24 h que nadie ve juntos |
| Los avisos del plan (prueba gratis, límites) solo aparecen en Inicio | Quien no abre Inicio no los ve |
| No existe ningún registro de «visto» | Cada aviso aparece siempre igual, aunque ya lo hayas revisado |
| La lectura de `dk_ai_insights` respeta la cuenta, la función activa y (Copilot) al autor | Base segura para reutilizar |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿De dónde salen las notificaciones? | **Una sola función en la base, `dk_my_notifications()`**, con los permisos de cada persona. Junta tres grupos:<br>• **Operación**: pedidos atrasados, por confirmar, insumos bajo el mínimo y clientes con saldo vencido.<br>• **IA**: los ítems de prioridad alta y media del último análisis de cada función (24 h), los errores de los análisis y el cupo.<br>• **Cuenta**: la prueba gratis y los límites del plan.<br>Cada una trae: tipo, gravedad, título, detalle, a dónde lleva, fecha y una clave estable. **No dispara análisis nuevos** (no gasta IA) |
| **D2** | ¿Cómo se marca «visto»? | **En la base, por persona** (tabla nueva `dk_notification_reads`, RLS: cada quien solo las suyas), para que siga a la persona en cualquier equipo. La clave incluye el estado: si cambia (por ejemplo, de 3 a 5 pedidos atrasados), vuelve a salir como nueva. «Marcar todo como leído» |
| **D3** | La campana | **Ícono 🔔 a la izquierda del avatar**, con un globito con las no leídas (9+). Abre un panel (en el celular, pantalla completa) con:<br>• pestañas **Todas** e **IA**;<br>• cada aviso con ícono de color según gravedad, título, detalle corto, «hace 5 min» y su acción («Ver pedidos», «Crear compra»…);<br>• los de IA con la etiqueta ✨ IA y su «por qué»;<br>• «Marcar todo como leído» y un estado vacío amable.<br>Se actualiza cada 60 s y al volver a la pestaña |
| **D4** | Errores de Copilot | **Ya no cuentan** como «análisis de IA con error» (tienen su métrica en «IA y voz»). La alerta solo cuenta los análisis y dice cuál falló |
| **D5** | Inicio | **Un solo bloque «Necesita atención»**, sin duplicados: tarjetas en cuadrícula con ícono de color, la cifra grande, la etiqueta y una flecha. Lo urgente (atrasados) resalta con un borde de color, no con una franja. Los avisos de IA y del plan **se van a la campana**; en Inicio queda solo una línea discreta: «✨ 4 sugerencias de IA nuevas · Ver en notificaciones» |
| **D6** | Tiempo real y avisos fuera de la app (push, correo) | **A «Futuro»**: hoy se consulta cada 60 s, como las alertas actuales |
| **D7** | Ayuda | Un artículo nuevo, «Notificaciones», y la guía de Inicio al día en el centro de ayuda (la fuente de verdad de «Oye Quanela»). El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración:<br>• la tabla `dk_notification_reads`;<br>• `dk_my_notifications()`;<br>• `dk_mark_notifications_read(keys)`;<br>• `dk_account_alerts` sin Copilot.<br>Pruebas SQL de permisos, claves, visto y que nadie lea lo de otro |
| 2 · Campana | `src/modules/notifications`: el hook, el botón con su globito, el panel, las pestañas y «marcar leído». En la barra de arriba, junto al avatar |
| 3 · Inicio | El nuevo «Necesita atención» y la línea de IA. Sin `AccountAlerts` en Inicio. `AlertList` en Configuración → Actividad se ve con el mismo estilo nuevo |
| 4 · Ayuda | Artículo «Notificaciones», la guía de Inicio y la captura en `screenshots.json` |
| — | Validación: Vitest, `tsc`, `oxlint`, SQL, builds, navegador (escritorio y celular) y esta ADR con resultados |

## 4. Futuro (no se simula)
| Mejora | Qué falta |
|---|---|
| Tiempo real | Supabase Realtime sobre los pedidos y los análisis |
| Push y correo | El proveedor de correo (pendiente) y permisos del navegador |
| Análisis de IA en segundo plano | Hoy corren al abrir su pantalla; un cron haría que lleguen solos (gasta cupo) |
| Preferencias por tipo de aviso | Una pantalla en «Mi perfil» |

## 5. Resultados (2026-10-06)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261006180000_dk_notifications.sql` (aplicada), con:<br>• la tabla `dk_notification_reads` (RLS: solo las propias);<br>• `dk_my_notifications()`;<br>• `dk_mark_notifications_read(keys)` (hasta 200; limpia lo leído hace más de 30 días);<br>• `dk_account_alerts` sin Copilot.<br>La IA toma **solo el último análisis** de cada función, con ítems alta y media (hasta 5). La misma sugerencia conserva su clave (función + referencia o título + prioridad), así 14 análisis al día no inundan la campana |
| 2 · Campana | `src/modules/notifications`: `NotificationBell` en el menú lateral, sobre el avatar, y en la barra del celular junto al avatar. Tiene:<br>• globito 9+;<br>• pestañas Todas e IA;<br>• ícono por tipo y gravedad, etiqueta ✨ IA con su fuente, «Ahora» o «Hace 5 min»;<br>• acción, punto de no leído y «Marcar todo como leído» (optimista).<br>Se actualiza cada 60 s y al volver a la pestaña |
| 3 · Inicio | Un solo «Necesita atención» en tarjetas, con la cifra grande, la etiqueta, el ícono y el borde ámbar si urge. Sale del mismo `dk_my_notifications`, sin duplicados. La línea «✨ N sugerencias de IA nuevas» abre la campana. Se eliminaron `AccountAlerts`, `AlertList`, `attentionRows`/`alertLink` y `fetchAccountAlerts` (sin otro uso). La fila «Preparando o listos para despachar» se fue: la tarjeta «Cocina ahora» ya lo muestra |
| 4 · Ayuda | Artículo «Notificaciones (la campana)», la guía de Inicio y las notas de versión al día, más la escena `notifications` en `screenshots.json`. `dk-copilot` desplegada otra vez con la base de conocimiento nueva (41 artículos) |

**Validación:**
- SQL: **865/865**. Los 20 nuevos de `notifications.sql` cubren:
  - los permisos por rol;
  - solo el último análisis y solo alta y media;
  - las claves estables;
  - Copilot fuera de los errores y de la alerta;
  - el «visto» propio que nadie más ve ni puede falsificar;
  - el rechazo de más de 200 claves y sin cuenta activa.
- Vitest: **511**. Son nuevas la lógica de notificaciones y la campana (contar, pestañas, abrir y marcar, marcar todo).
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre.
- Los dos builds correctos.
- Con los datos reales de la cuenta del dueño (consulta revertida), la campana trae:
  - 3 avisos de operación;
  - 5 sugerencias de la IA de cocina, cada una con el enlace a su pedido;
  - ningún error de Copilot.
- Corregido además: `features.test.ts` solo lee las migraciones que siembran el catálogo.

**No verificado en pantalla:** la campana y el nuevo Inicio requieren sesión, y no inicio sesión por el usuario.
