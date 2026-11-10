#!/usr/bin/env node
/**
 * Build the Vite app into app/dist, then publish static files to the repository
 * root for GitHub Pages (deploy from branch `main`, folder `/`).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.resolve(appDir, '..')
const distDir = path.join(appDir, 'dist')

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function rmrf(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else copyFile(from, to)
  }
}

if (!fs.existsSync(path.join(rootDir, 'app'))) {
  console.error('Refusing to publish: app/ missing at repository root.')
  process.exit(1)
}

run('npm', ['run', 'build'], appDir)

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('Build did not produce app/dist/index.html')
  process.exit(1)
}

// Remove previously published site files at repo root (never touch app/).
rmrf(path.join(rootDir, 'assets'))
for (const name of ['index.html', 'favicon.svg', 'favicon.ico']) {
  const p = path.join(rootDir, name)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

// Copy dist → repo root
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  const from = path.join(distDir, entry.name)
  const to = path.join(rootDir, entry.name)
  if (entry.name === 'app') {
    console.error('Refusing to copy a dist entry named app/')
    process.exit(1)
  }
  if (entry.isDirectory()) copyDir(from, to)
  else copyFile(from, to)
}

// Prevent Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(rootDir, '.nojekyll'), '')

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')
if (!html.includes('/hbd-website/assets/')) {
  console.error('Published index.html is missing /hbd-website/ asset base path')
  process.exit(1)
}

console.log('Published static site to repository root for branch-based GitHub Pages.')
