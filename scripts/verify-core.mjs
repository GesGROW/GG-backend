import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const canonical = path.join(root, 'supabase/functions/_shared/core')
const installed = fileURLToPath(
  new URL('./', import.meta.resolve('@gesgrow/core/package.json'))
)
const files = (dir) =>
  readdirSync(path.join(dir, 'src'), { recursive: true, withFileTypes: true })
    .filter((x) => x.isFile())
    .map((x) => path.relative(dir, path.join(x.parentPath, x.name)))
    .sort()
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const expected = files(canonical),
  actual = files(installed)
if (JSON.stringify(expected) !== JSON.stringify(actual))
  throw new Error('El paquete instalado no coincide con la fuente canónica')
for (const file of expected)
  if (sha(path.join(canonical, file)) !== sha(path.join(installed, file)))
    throw new Error('Falta empaquetar el cambio: ' + file)
if (
  JSON.parse(readFileSync(path.join(canonical, 'package.json'))).version !==
  JSON.parse(readFileSync(path.join(installed, 'package.json'))).version
)
  throw new Error('La versión instalada no coincide con la fuente')
console.log(
  `@gesgrow/core: ${expected.length} archivos coinciden con las fuentes de las Edge Functions`
)
