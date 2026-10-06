// ADR 0034: builds the help center and the knowledge base of «Oye Quanela»
// from content/help. Run `npm run help` after changing an article (the build
// runs it too). Fails on any content error.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHelp, renderOutputs } from './help/lib.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const build = buildHelp(root)
if (build.errors.length) {
  console.error(`Centro de ayuda: ${build.errors.length} error(es) en el contenido:\n  - ${build.errors.join('\n  - ')}`)
  process.exit(1)
}
for (const [file, text] of Object.entries(renderOutputs(build))) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text)
}
const pending = Object.values(build.articles).flatMap((a) => a.shots.filter((s) => !s.ready))
console.log(`Centro de ayuda: ${Object.keys(build.articles).length} artículos en ${build.sections.length} secciones · ${pending.length} captura(s) pendientes.`)
