#!/usr/bin/env node
// Na elke publicatie: installeer het ECHTE, net gepubliceerde pakket in een
// schone map BUITEN deze workspace (echte npm-symlinks in node_modules/.bin,
// zoals een vreemde op macOS/Linux ook krijgt) en draai elke bin er echt
// doorheen. Gebouwd na YE-YI7's vondst (14 nov 2026): capacity-attest-fiscal-check
// gaf exit 0 zonder uitvoer voor ELK bestand zodra het via zo'n echte
// symlink werd aangeroepen, omdat de "ben ik rechtstreeks gestart"-check
// import.meta.url tegen een ONontbonden argv[1] vergeleek. Een build/test
// binnen deze workspace kan dit nooit vangen, want hier resolven paden altijd
// lokaal. Dit script hoort als VERPLICHTE stap NA npm publish te draaien.
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const pakket = process.argv.find((a) => a.startsWith('--pakket='))?.split('=')[1] ?? 'capacity-attest'
const versie = process.argv.find((a) => a.startsWith('--versie='))?.split('=')[1]
if (!versie) {
  console.error('gebruik: node verify-published-bins.mjs --pakket=<naam> --versie=<versie>')
  process.exit(2)
}

// shell:true is nodig omdat npm/npx op Windows een .cmd-shim is -- zonder
// shell vindt spawnSync het pad niet (ENOENT), ook al staat het gewoon op
// het PATH (dezelfde les als scripts/kale-installatie-check.mjs, 14 nov
// 2026). cmd+args zelf tot een regel samenvoegen i.p.v. de array los met
// shell:true meegeven voorkomt de DEP0190-waarschuwing (sinds Node 24).
function draai(cmd, args, opties = {}) {
  const regel = [cmd, ...args.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a))].join(' ')
  const r = spawnSync(regel, { encoding: 'utf8', timeout: 30000, shell: true, ...opties })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', fout: r.error ? String(r.error.message) : '' }
}

async function wachtOpEchtGepubliceerd(pakket, versie, { max = 20, wachtMs = 15000 } = {}) {
  for (let i = 0; i < max; i++) {
    const v = draai('npm', ['view', `${pakket}@${versie}`, 'version'])
    if (v.status === 0 && v.stdout.trim() === versie) {
      // De versie-metadata kan eerder leven dan het echte tarbal-bestand
      // zelf (CDN-vertraging, gemeten 14 nov 2026) -- een echte installatie
      // is de enige manier om te weten of het bestand er ook echt is.
      const probeerMap = mkdtempSync(join(tmpdir(), 'npm-pack-probe-'))
      const probeer = draai('npm', ['pack', `${pakket}@${versie}`], { cwd: probeerMap })
      rmSync(probeerMap, { recursive: true, force: true })
      if (probeer.status === 0) return true
    }
    console.log(`[${i + 1}/${max}] nog niet echt ophaalbaar, ${wachtMs / 1000}s wachten...`)
    await new Promise((r) => setTimeout(r, wachtMs))
  }
  return false
}

function faalLuid(bin, reden, uitvoer) {
  console.error(`FAIL  ${bin}: ${reden}`)
  if (uitvoer) console.error('  uitvoer: ' + JSON.stringify(uitvoer).slice(0, 1000))
  process.exitCode = 1
}

async function main() {
  console.log(`Wachten tot ${pakket}@${versie} echt, fysiek ophaalbaar is (niet alleen de metadata)...`)
  const klaar = await wachtOpEchtGepubliceerd(pakket, versie)
  if (!klaar) {
    console.error(`FAIL: ${pakket}@${versie} werd niet binnen de wachttijd echt ophaalbaar.`)
    process.exit(1)
  }

  const map = mkdtempSync(join(tmpdir(), 'verify-published-bins-'))
  console.log('Schone map (buiten elke workspace):', map)
  try {
    const init = draai('npm', ['init', '-y'], { cwd: map })
    if (init.status !== 0) { faalLuid('npm init', 'kon geen package.json maken', init); return }
    const install = draai('npm', ['install', `${pakket}@${versie}`], { cwd: map, timeout: 120000 })
    if (install.status !== 0) { faalLuid('npm install', 'de echte installatie zelf faalde', install); return }

    const binDir = join(map, 'node_modules', '.bin')
    const mcpBin = join(binDir, pakket)
    const fiscalBin = join(binDir, `${pakket}-fiscal-check`)
    const httpBin = join(binDir, `${pakket}-http`)

    // 1. Het hoofd-MCP-pakket: een echte initialize-aanroep, moet een
    // niet-lege, geldige JSON-RPC-reactie teruggeven (een schema-foutmelding
    // op een opzettelijk onvolledig verzoek is een GOED teken: de server
    // draait en valideert echt).
    if (existsSync(mcpBin)) {
      const r = draai(mcpBin, [], {
        cwd: map,
        input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } }) + '\n',
        timeout: 8000,
      })
      if (!r.stdout.trim()) faalLuid(pakket, 'gaf GEEN enkele uitvoer op een echte initialize-aanroep via de echte symlink', r)
      else console.log(`OK    ${pakket}: gaf echte uitvoer terug via de symlink`)
    }

    // 2. De fiscal-check CLI: een geldig en een ongeldig testbestand, elk
    // via de echte symlink. Precies de regressie van 14 nov 2026.
    if (existsSync(fiscalBin)) {
      const geldig = join(map, 'geldig.json')
      const ongeldig = join(map, 'ongeldig.json')
      writeFileSync(geldig, JSON.stringify({ version: '2', controls: [] }))
      writeFileSync(ongeldig, JSON.stringify({ version: 'niet-2' }))
      const rGeldig = draai(fiscalBin, [geldig], { cwd: map })
      const rOngeldig = draai(fiscalBin, [ongeldig], { cwd: map })
      if (rGeldig.status !== 0 || !rGeldig.stdout.trim()) faalLuid(`${pakket}-fiscal-check`, 'een GELDIG bestand gaf geen exit 0 met echte uitvoer via de symlink', rGeldig)
      else if (rOngeldig.status === 0) faalLuid(`${pakket}-fiscal-check`, 'een ONGELDIG bestand gaf exit 0 (hoort te weigeren) via de symlink -- dit is precies de stille regressie van 14 nov', rOngeldig)
      else console.log(`OK    ${pakket}-fiscal-check: geldig->0 met uitvoer, ongeldig->afgewezen, via de echte symlink`)
    }

    // 3. De HTTP-server: moet echt gaan luisteren en een echt antwoord geven.
    if (existsSync(httpBin)) {
      const proc = spawn(httpBin, [], { cwd: map, shell: true })
      let gezien = ''
      proc.stdout.on('data', (d) => { gezien += d.toString() })
      await new Promise((r) => setTimeout(r, 2000))
      const curl = draai('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8402/.well-known/fiscal-controls.json'])
      proc.kill()
      // Geef het net gedode proces een moment om zijn bestandsgrepen echt
      // los te laten voor de opruimstap -- anders kan rmSync op Windows
      // EPERM geven op een map die het proces nog net aanraakte.
      await new Promise((r) => setTimeout(r, 500))
      if (curl.stdout.trim() !== '200') faalLuid(`${pakket}-http`, 'gaf geen HTTP 200 op /.well-known/fiscal-controls.json via de symlink', { curl: curl.stdout, serverOutput: gezien })
      else console.log(`OK    ${pakket}-http: luisterde en antwoordde echt, via de symlink`)
    }
  } finally {
    try {
      rmSync(map, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
    } catch (e) {
      // Opruimen is hygiëne, geen onderdeel van het oordeel -- een
      // mislukte opruiming mag een echt PASS-resultaat niet verdoezelen
      // tot een exitcode 1.
      console.warn('kon de schone map niet volledig opruimen (' + e.message + '); geen gevolg voor het oordeel hierboven.')
    }
  }
}

main()
