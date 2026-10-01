// One repository, two Vercel projects (ADR 0019): Quanela (default) and the
// Global Admin portal (project env QUANELA_APP=admin). Both publish to dist/.
import { execSync } from 'node:child_process'
import path from 'node:path'

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })

if (process.env.QUANELA_APP === 'admin') {
  run('npm run build:admin', { ADMIN_OUT_DIR: path.resolve('dist') })
} else {
  run('npm run build')
}
