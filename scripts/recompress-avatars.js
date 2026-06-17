/**
 * recompress-avatars.js
 * Recomprime los avatares ya subidos en crudo a WebP 256px y los re-sube con
 * cacheControl de 1 año, para frenar el cached egress del CDN de Supabase.
 * Las subidas nuevas ya van comprimidas (ver src/pages/Perfil.jsx); esto limpia
 * los que se subieron antes.
 *
 * Ejecutar UNA SOLA VEZ:
 *   node scripts/recompress-avatars.js --dry-run   (no escribe, solo reporta)
 *   node scripts/recompress-avatars.js             (aplica)
 *
 * Requiere en .env:
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import sharp from 'sharp'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET       = 'avatars'
const MAX_PX       = 256
const DRY_RUN      = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

const kb = bytes => `${Math.round(bytes / 1024)} KB`

async function listAvatarFiles() {
  // Estructura: `${user.id}/avatar.ext`. Listamos carpetas (user ids) y dentro.
  const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error

  const files = []
  for (const folder of folders ?? []) {
    if (folder.id !== null) continue // saltar archivos sueltos en raíz
    const { data: inner, error: innerErr } = await supabase.storage
      .from(BUCKET).list(folder.name, { limit: 100 })
    if (innerErr) throw innerErr
    for (const f of inner ?? []) {
      if (f.id === null) continue
      files.push({ userId: folder.name, name: f.name, path: `${folder.name}/${f.name}` })
    }
  }
  return files
}

async function run() {
  console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Recomprimiendo avatares en bucket "${BUCKET}"\n`)

  const files = await listAvatarFiles()
  const toProcess = files.filter(f => !f.name.toLowerCase().endsWith('.webp'))

  if (toProcess.length === 0) {
    console.log('No hay avatares en crudo que recomprimir. Nada que hacer.')
    return
  }

  let savedBefore = 0, savedAfter = 0, done = 0
  for (const f of toProcess) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(f.path)
    if (dlErr) { console.error(`  ✗ ${f.path}: error al descargar — ${dlErr.message}`); continue }

    const input  = Buffer.from(await blob.arrayBuffer())
    const output = await sharp(input)
      .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    savedBefore += input.length
    savedAfter  += output.length
    console.log(`  ${f.path}: ${kb(input.length)} → avatar.webp ${kb(output.length)}`)

    if (DRY_RUN) { done++; continue }

    const newPath = `${f.userId}/avatar.webp`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, output, {
      upsert: true, contentType: 'image/webp', cacheControl: '31536000',
    })
    if (upErr) { console.error(`  ✗ ${f.path}: error al subir — ${upErr.message}`); continue }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
    const versionedUrl = `${publicUrl}?v=${Date.now()}`

    const { error: updErr } = await supabase
      .from('profiles').update({ avatar_url: versionedUrl }).eq('id', f.userId)
    if (updErr) { console.error(`  ✗ ${f.path}: error al actualizar perfil — ${updErr.message}`); continue }

    if (f.name.toLowerCase() !== 'avatar.webp') {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([f.path])
      if (rmErr) console.warn(`  ! ${f.path}: subido pero no se pudo borrar el viejo — ${rmErr.message}`)
    }
    done++
  }

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}${done}/${toProcess.length} avatares · ${kb(savedBefore)} → ${kb(savedAfter)} en disco`)
  if (DRY_RUN) console.log('Nada escrito. Quita --dry-run para aplicar.')
}

run().catch(err => { console.error(err); process.exit(1) })
