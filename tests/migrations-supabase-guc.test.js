import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const dir = new URL('../supabase/migrations/', import.meta.url)
// También detecta formato dinámico (%s), saltos de línea y nombres entre comillas.
const alterGuc = /\balter\s+function\b[^;]*?\bset\s+["']?scc\s*\./i
const createGuc =
  /\bcreate\s+(?:or\s+replace\s+)?function\b[^;]*?\bset\s+["']?scc\s*\./i

test('ninguna migración configura GUC scc permanentes en funciones', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(new URL(file, dir), 'utf8')
    assert.doesNotMatch(sql, alterGuc, file)
    assert.doesNotMatch(sql, createGuc, file)
  }
})

test('la guarda detecta también la instrucción dinámica que falló en Supabase', () => {
  for (const sql of [
    "execute format('alter function %s set scc.campania_id to %L',firma,'');",
    'ALTER FUNCTION public.f(uuid)\n SET "scc.tenant_id" TO \'\';',
    "alter function public.f() set scc.hoja_campania_id = '';"
  ])
    assert.match(sql, alterGuc)
})
