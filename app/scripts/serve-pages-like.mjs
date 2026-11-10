#!/usr/bin/env node
/**
 * Serve the repository root exactly as GitHub Pages would for a project site:
 * files at repo root are available under /hbd-website/...
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PREFIX = '/hbd-website'
const PORT = Number(process.env.PORT || 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  let pathname = decodeURIComponent(url.pathname)

  if (pathname === '/' || pathname === PREFIX) {
    res.writeHead(302, { Location: `${PREFIX}/` })
    res.end()
    return
  }

  if (!pathname.startsWith(`${PREFIX}/`) && pathname !== PREFIX) {
    send(res, 404, `Not found (expected under ${PREFIX}/): ${pathname}`)
    return
  }

  let rel = pathname.slice(PREFIX.length)
  if (rel === '' || rel === '/') rel = '/index.html'
  // Prevent path traversal
  const filePath = path.normalize(path.join(rootDir, rel))
  if (!filePath.startsWith(rootDir)) {
    send(res, 403, 'Forbidden')
    return
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const asIndex = path.join(filePath, 'index.html')
    if (fs.existsSync(asIndex)) {
      const data = fs.readFileSync(asIndex)
      send(res, 200, data, TYPES['.html'])
      return
    }
    send(res, 404, `Not found: ${pathname}`)
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const data = fs.readFileSync(filePath)
  send(res, 200, data, TYPES[ext] || 'application/octet-stream')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pages-like static server: http://127.0.0.1:${PORT}${PREFIX}/`)
  console.log(`Serving repository root: ${rootDir}`)
})
