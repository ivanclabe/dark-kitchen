# Documentos legales de Quanela

Aquí viven los textos legales que se publican en `/legal/<slug>` y que los usuarios aceptan. La decisión y el contexto están en `docs/adr/0071-cumplimiento-legal-colombia.md`.

## Archivos

| Archivo | Documento |
| --- | --- |
| `terminos.md` | Términos y Condiciones (incluye el Anexo de tratamiento de datos por encargo) |
| `privacidad.md` | Política de Tratamiento de Datos Personales y Privacidad |
| `suscripciones.md` | Suscripciones, renovación automática y cobros |
| `reembolsos.md` | Política de Cancelaciones y Reembolsos |
| `cookies.md` | Política de Cookies |
| `politica-cocina.md` | Plantilla de la política de datos de cada cocina (menú público y WhatsApp) |
| `empresa.yaml` | Datos de la empresa que se insertan en los textos |

Este README no es un documento legal y no se publica.

## Encabezado (frontmatter)

Cada documento empieza con YAML:

```yaml
---
slug: terminos            # terminos | privacidad | cookies | reembolsos | suscripciones | politica-cocina
title: Términos y Condiciones
summary: Una frase (máx. 200 caracteres).
version: "1.0"
effective: 2026-10-19     # fecha de vigencia (AAAA-MM-DD)
order: 1                  # orden en el índice de /legal
requiresReacceptance: false   # opcional; se omite en la versión 1.0
---
```

El cuerpo es Markdown (GFM). Los títulos empiezan en `##`, porque la página muestra `title` como h1. Los enlaces entre documentos usan `/legal/<slug>`.

## Tokens

- `{{empresa.campo}}`: se reemplaza al compilar con el valor de `empresa.yaml`. Si está vacío, se muestra resaltado como «Pendiente: …».
- `{{pendiente: descripción}}`: un dato que el propietario debe confirmar y que no es un campo de la empresa. Se muestra como «Pendiente: descripción». Antes de publicar en firme, cada uno debe resolverse editando el texto.
- `{{cocina.campo}}` (solo en `politica-cocina.md`): se reemplaza en tiempo de ejecución con los datos de cada cocina (nombre, razón social, NIT, dirección, ciudad, teléfono).

## Cambios y versiones

1. **Cualquier cambio en el texto** de un documento, incluido un cambio en `empresa.yaml` que afecte su texto, exige subir `version` (p. ej., de `"1.0"` a `"1.1"`) y actualizar `effective`. La evidencia de aceptación guarda la versión y el hash del texto: si el texto cambia sin cambiar la versión, la prueba deja de coincidir.
2. Ejecuta `npm run legal -- --accept`. El script recalcula el hash SHA-256 de cada documento (con los tokens de empresa ya reemplazados) y regenera `versions.json`.
3. **Cada nueva versión necesita su fila en la base de datos** (`dk_legal_documents`: slug, versión, vigencia, hash y `requires_reacceptance`), con una migración nueva. Las aceptaciones anteriores nunca se modifican.

## Cuándo pedir que acepten de nuevo (`requiresReacceptance: true`)

Márcalo cuando el cambio afecte los derechos u obligaciones de quien ya aceptó, por ejemplo:

- una finalidad nueva del tratamiento de datos o un tipo de dato nuevo (en ese caso la ley exige una nueva autorización);
- condiciones de cobro, renovación, reembolso o terminación menos favorables;
- un nuevo encargado que reciba datos en otro país, o nuevas responsabilidades del usuario.

No hace falta para correcciones de redacción, erratas, datos de contacto actualizados o cambios que solo favorecen al usuario. En esos casos basta con publicar la nueva versión y avisar.

Cuando un cambio afecte a los usuarios, avísalo **antes** de que entre en vigor. Cualquier cambio de fondo debe revisarlo un abogado.
