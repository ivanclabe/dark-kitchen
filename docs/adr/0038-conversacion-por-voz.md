# ADR 0038: Conversación por voz con «Oye Quanela» (seguir escuchando, contexto y aviso en Copilot)

## Estado
**Aprobada e implementada (2026-10-06).** Falta la prueba con micrófono real (la hace el usuario).

**Pedido:**
1. Después de «Oye Quanela», que **siga escuchando**: modo conversación, sin repetir la frase en cada pregunta.
2. Pasar al agente el **historial reciente** como contexto de la conversación.
3. **No abrir el chat de Copilot** con la voz; un **globito** en su ícono indica que hay respuestas sin ver.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| `VoiceProvider`: «Oye Quanela» → tono → escucha una frase (5 s) → responde → **vuelve a esperar la frase** | Cada pregunta de seguimiento exige decir «Oye Quanela» otra vez |
| La respuesta se habla con `deviceSpeech` (cola con prioridades). `isSpeaking(tail)` dice si todavía suena | Sirve para volver a escuchar **cuando termine de hablar**, sin que el micrófono se oiga a sí mismo |
| Copilot **ya recibe historial**: los últimos 8 turnos (voz y texto juntos, 2.000 caracteres cada uno), desde la memoria del navegador | Se pierde al recargar la página. El agente no sabe qué intención ni qué herramientas usó la respuesta anterior, así que «¿y ayer?» depende solo del texto |
| El manejador de voz de Copilot hace `setOpen(true)` | **Cada pregunta por voz abre el chat** y tapa la pantalla (por ejemplo, la cocina) |
| El botón Copilot no tiene ningún indicador | No se sabe que llegó una respuesta |
| Palabras de parada: «cancela», «para», «silencio»… | Sirven para salir de la conversación; falta un cierre amable («gracias», «listo», «eso es todo») |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Modo conversación | Tras «Oye Quanela», cuando Quanela **termina de hablar** (más un margen para el eco), **vuelve a escuchar sola** durante **8 s**, con un tono distinto y más suave. Si dices otra pregunta, sigue la conversación; si no hablas, termina en silencio y vuelve a esperar «Oye Quanela». Solo la frase activa este modo (el botón «Hablar ahora» y Ctrl/⌘+Shift+J siguen siendo de una sola frase) |
| **D2** | Cómo se sale | En silencio (8 s sin hablar); con «gracias», «listo», «eso es todo» o «terminar» (responde «Con gusto.»); con «para», «cancela» o «silencio»; con el botón **Terminar**; al cambiar de pestaña o de cuenta. Tope de seguridad: **10 turnos** o **3 minutos** |
| **D3** | Se ve | El micrófono de arriba dice **«Conversación · te escucho»** (con un punto animado mientras escucha y «Respondiendo…» mientras habla). En su menú está **Terminar conversación** |
| **D4** | Preferencia | En «Voz en este equipo»: **«Seguir escuchando después de responder»**, encendida por defecto. Apagada, se comporta como hoy |
| **D5** | Contexto para el agente | La app envía:<br>• los **últimos 6 turnos** (3 preguntas con sus respuestas);<br>• por cada respuesta: su **intención**, sus **herramientas** (por ejemplo «ventas · ayer») y su resumen hablado;<br>• la **pantalla** actual y si la conversación es por voz.<br>El servidor mantiene sus topes (8 turnos, 2.000 caracteres) y el prompt suma una regla: una pregunta de seguimiento («¿y ayer?», «¿y de ese plato?») completa lo que falta con el turno anterior. Lo que no se pueda ver por permisos sigue sin verse: el contexto no da acceso a nada |
| **D6** | ¿Dónde vive la conversación? | En **`sessionStorage`** por cuenta (esta pestaña), **30 minutos**: sobrevive a una recarga y no sale del equipo. «Nueva conversación» la borra. Nada nuevo en la base |
| **D7** | El chat no se abre con la voz | La respuesta se oye y se ve en la burbuja del micrófono (como hoy). El ícono ✦ Copilot muestra un **globito con las respuestas sin ver** (9+). Mientras consulta, un punto que pulsa. Al abrir el chat, el contador vuelve a cero |
| **D8** | Ayuda | La guía de «Oye Quanela» y la de Copilot al día en el centro de ayuda (fuente de verdad del agente), y `dk-copilot` desplegada otra vez. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Conversación | `VoiceProvider`: el estado `conversing`, volver a escuchar al terminar de hablar (sin eco), la ventana de 8 s, los topes y las salidas. `router.ts`: las palabras de cierre. `prefs`: la preferencia. `VoiceMenu`: la etiqueta, «Terminar conversación» y la burbuja |
| 2 · Contexto | `CopilotProvider` + `api.ts`: el historial compacto con intención y herramientas, y la conversación en `sessionStorage`. `dk-copilot`: leer esos campos (validados y recortados) y la regla de seguimiento en el prompt. Pruebas del contrato |
| 3 · Aviso | Quitar `setOpen(true)` de la voz. Contador de respuestas sin ver y su globito en `CopilotButton`, que se limpia al abrir |
| 4 · Ayuda | Las guías al día y `dk-copilot` desplegada |
| — | Validación: Vitest (la máquina de estados con reloj falso, el router, el historial, el globito), `tsc`, `oxlint`, builds y el contrato de la función. La prueba con micrófono la haces tú (yo no puedo hablarle) |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| El micrófono oye la propia voz de Quanela | Volver a escuchar solo cuando `deviceSpeech` terminó, más 600 ms de margen. Si hay ruido de fondo, el texto vacío no cuenta |
| Ruido de cocina dispara preguntas | Solo dentro de la ventana de 8 s tras una respuesta; frases de menos de 2 palabras que no son comandos ni preguntas se ignoran; tope de turnos |
| Gasto de cupo | Cada pregunta sigue contando una (como hoy). El silencio no gasta nada |

## 5. Resultados (2026-10-06)
| Fase | Qué quedó |
|---|---|
| 1 · Conversación | `VoiceProvider`:<br>• la frase abre una conversación (`conversationRef`);<br>• tras cada respuesta, `continueConversation` espera a que `deviceSpeech` calle (+600 ms de eco) y abre otro turno con `playFollowUpTone` y 8 s de ventana, sin la frase;<br>• salidas: silencio, `close` («gracias», «listo», «eso es todo», «terminar»…), «para», **Terminar**, pestaña oculta, 10 turnos o 3 min;<br>• una palabra suelta tras una respuesta es ruido (no gasta una pregunta);<br>• el manos libres no escucha la frase mientras conversa.<br>`VoiceMenu`: «Conversación · te escucho / respondiendo» y «Terminar conversación». Preferencia `followUp` (`dk-voice-follow-up`) en «Voz en este equipo» |
| 2 · Contexto | La app (`lib/conversation.ts`):<br>• `historyFor` manda las últimas 6 vueltas, y cada respuesta con su `intent` y `tools` (la herramienta con sus argumentos, por ejemplo `sales {"from":"2026-10-06"}`);<br>• la conversación vive en `sessionStorage` por cuenta, 30 min.<br>El servidor (`contract.ts`):<br>• `readHistory` valida (roles, intención `[a-z_]`, hasta 6 herramientas de 120 caracteres), recorta, alterna y quita la pregunta sin responder;<br>• `stepContext` devuelve el contexto de cada paso;<br>• el prompt suma la regla de seguimiento (volver a consultar, nunca reusar cifras viejas). `dk-copilot` desplegada |
| 3 · Aviso | La voz ya no abre el panel. `CopilotButton` muestra un globito con las respuestas sin ver (9+) y un punto que pulsa mientras consulta; se limpia al abrir o cerrar el panel |
| 4 · Ayuda | «Oye Quanela» (la sección «Conversar sin repetir «Oye Quanela»» y la preferencia), Copilot (memoria y respuestas sin ver) y notas de versión |

**Validación:**
- Vitest: **528**. Son nuevas:
  - 9 de la conversación con reloj falso: sigue escuchando, silencio, «gracias» y «para», una palabra suelta, un comando de cocina, «Hablar ahora» de una frase, la preferencia apagada, el tope de turnos y «Terminar»;
  - el router con las frases de cierre;
  - 5 del contexto (servidor y app, `sessionStorage` con caducidad);
  - 3 del panel (no se abre y muestra el globito, el historial con contexto, sobrevive a la recarga).
- `tsc` (app y función) sin errores; `oxlint` con los 14 avisos de siempre; los dos builds correctos.
- `dk-copilot` responde 401 sin sesión, como debe.

**Pendiente:** la prueba con micrófono, el eco en el parlante real y el ruido de cocina, en un equipo del usuario.
