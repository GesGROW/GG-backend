import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(root, 'supabase/functions/_shared/core')
const staging = mkdtempSync(path.join(tmpdir(), 'gesgrow-core-'))
if (!process.env.npm_execpath) throw new Error('Ejecutar mediante npm run pack:core')
const [artifact] = JSON.parse(
  execFileSync(
    process.execPath,
    [process.env.npm_execpath, 'pack', '--json', '--pack-destination', staging],
    { cwd: source, encoding: 'utf8' }
  )
)
const packed = path.join(staging, artifact.filename)
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
for (const arg of process.argv.slice(2).length ? process.argv.slice(2) : ['vendor']) {
  const destination = path.resolve(root, arg)
  mkdirSync(destination, { recursive: true })
  const target = path.join(destination, artifact.filename)
  if (existsSync(target) && sha(target) !== sha(packed))
    throw new Error(
      'Esta versión ya existe con otro contenido. Sube la versión antes de distribuir: ' +
        target
    )
  copyFileSync(packed, target)
  console.log(`${artifact.filename} → ${destination}\nSHA-256 ${sha(target)}`)
}
