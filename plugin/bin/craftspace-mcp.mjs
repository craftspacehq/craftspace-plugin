#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024
const MAX_EXPANDED_BYTES = 60 * 1024 * 1024
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_FILES = 1000
const MAX_PATH_BYTES = 240
const FORBIDDEN_SEGMENTS = new Set(['.git', 'node_modules', 'dist'])

export async function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = resolve(args.root ?? process.cwd())
  const configuration = loadConfiguration({ root, args })
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim() === '') continue
    let request
    try {
      request = JSON.parse(line)
    } catch {
      write(errorResponse(null, 'Invalid JSON-RPC message.'))
      continue
    }
    void handleRequest({ request, configuration })
      .then((response) => {
        if (response !== undefined) write(response)
      })
      .catch((error) => {
        if (request.id !== undefined) write(errorResponse(request.id, errorMessage(error)))
      })
  }
}

export async function handleRequest({ request, configuration, requestFetch = fetch }) {
  if (configuration.error !== undefined) return unconfiguredResponse({ request, message: configuration.error })
  if (request.method === 'tools/call' && request.params?.name === 'download_plugin') {
    const directory = request.params.arguments?.directory
    if (directory !== undefined) {
      return downloadToDirectory({ request, configuration, directory, requestFetch })
    }
  }
  if (request.method === 'tools/call' && request.params?.name === 'upsert_plugin') {
    const directory = request.params.arguments?.directory
    if (directory !== undefined) {
      return upsertFromDirectory({ request, configuration, directory, requestFetch })
    }
  }
  return forward({ request, configuration, requestFetch })
}

export function loadConfiguration({ root, args = {}, environment = process.env }) {
  const configPath = join(root, '.craftspace.json')
  let project = {}
  if (existsSync(configPath)) {
    try {
      project = JSON.parse(readFileSync(configPath, 'utf8'))
    } catch {
      return { error: '.craftspace.json is not valid JSON.' }
    }
  }
  const org = args.org ?? environment.CRAFTSPACE_ORG ?? project.org
  if (typeof org !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(org)) {
    return {
      error:
        'Craftspace local MCP is not configured. Add .craftspace.json with {"org":"your-org-slug"}, then restart Claude Code.',
    }
  }
  const endpointBase = args.endpoint ?? environment.CRAFTSPACE_MCP_URL ?? project.endpoint ?? 'https://craftspace.app/mcp'
  if (typeof endpointBase !== 'string') return { error: 'Craftspace endpoint must be a URL.' }
  try {
    const protocol = new URL(endpointBase).protocol
    if (protocol !== 'http:' && protocol !== 'https:') return { error: 'Craftspace endpoint must use HTTP or HTTPS.' }
  } catch {
    return { error: 'Craftspace endpoint must be a URL.' }
  }
  const pluginData = environment.CRAFTSPACE_PLUGIN_DATA
  const tokenPath = tokenFile({ root, org, args, project, pluginData })
  const suppliedToken = environment.CRAFTSPACE_TOKEN
  if (typeof suppliedToken === 'string' && suppliedToken.startsWith('cst_') && tokenPath !== undefined) {
    mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 })
    writeFileSync(tokenPath, `${suppliedToken}\n`, { mode: 0o600 })
    chmodSync(tokenPath, 0o600)
  }
  const token = typeof suppliedToken === 'string' && suppliedToken !== ''
    ? suppliedToken
    : tokenPath !== undefined && existsSync(tokenPath)
      ? readFileSync(tokenPath, 'utf8').trim()
      : undefined
  if (typeof token !== 'string' || !token.startsWith('cst_')) {
    return {
      error:
        `Craftspace local MCP needs a member token for ${org}. Set CRAFTSPACE_TOKEN once and restart ` +
        'Claude Code; the bridge stores it in the plugin data directory, outside the project.',
    }
  }
  const endpoint = endpointBase.endsWith(`/${org}`)
    ? endpointBase
    : `${endpointBase.replace(/\/$/, '')}/${encodeURIComponent(org)}`
  return { root: realpathSync(root), org, endpoint, token }
}

export function createArchive(directory) {
  if (lstatSync(directory).isSymbolicLink()) throw new Error('The plugin root is a symlink.')
  const root = realpathSync(directory)
  const files = walkDirectory(root)
  const expandedBytes = files.reduce((total, file) => total + file.content.length, 0)
  if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('The plugin package is larger than 60 MB.')
  const parts = files.flatMap((file) => {
    const padding = Buffer.alloc((512 - (file.content.length % 512)) % 512)
    return [tarHeader({ path: file.path, size: file.content.length }), file.content, padding]
  })
  const archive = gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]), { level: 9 })
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('The plugin archive is larger than 15 MB.')
  return archive
}

export function extractArchive({ archive, destination, root }) {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('The plugin archive is larger than 15 MB.')
  const files = parseArchive(archive)
  const target = safeTarget({ root, relativePath: destination })
  if (existsSync(target)) {
    const state = lstatSync(target)
    if (state.isSymbolicLink()) throw new Error(`Refusing to write through the symlink at ${destination}.`)
    if (!state.isDirectory()) throw new Error(`${destination} is a file, not a directory.`)
    if (readdirSync(target).length > 0) {
      throw new Error(`${destination} is not empty. Choose a new directory so no local work is overwritten.`)
    }
  }
  const staging = mkdtempSync(join(realpathSync(root), '.craftspace-plugin-'))
  try {
    for (const file of files) {
      const path = join(staging, ...file.path.split('/'))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.content, { mode: 0o644 })
    }
    mkdirSync(dirname(target), { recursive: true })
    if (existsSync(target)) rmdirSync(target)
    renameSync(staging, target)
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return files.length
}

async function downloadToDirectory({ request, configuration, directory, requestFetch }) {
  const argumentsWithoutDirectory = { ...request.params.arguments }
  delete argumentsWithoutDirectory.directory
  const upstream = await forward({
    request: {
      ...request,
      params: { ...request.params, arguments: argumentsWithoutDirectory },
    },
    configuration,
    requestFetch,
  })
  if (upstream.error !== undefined || upstream.result?.isError) return upstream
  const metadata = upstream.result?.structuredContent
  if (typeof metadata?.downloadUrl !== 'string' || typeof metadata.sha256 !== 'string') {
    return errorResponse(request.id, 'Craftspace did not return a plugin archive.')
  }
  const response = await requestFetch(metadata.downloadUrl)
  if (!response.ok) return errorResponse(request.id, `Plugin download failed with HTTP ${response.status}.`)
  const archive = Buffer.from(await response.arrayBuffer())
  const sha256 = createHash('sha256').update(archive).digest('hex')
  if (sha256 !== metadata.sha256) return errorResponse(request.id, 'Plugin download checksum did not match.')
  const fileCount = extractArchive({ archive, destination: directory, root: configuration.root })
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [
        {
          type: 'text',
          text: `Wrote ${fileCount} files to ${directory}. Revision ${metadata.revision}.`,
        },
      ],
      structuredContent: {
        writtenTo: directory,
        revision: metadata.revision,
        fileCount,
        sha256,
      },
    },
  }
}

async function upsertFromDirectory({ request, configuration, directory, requestFetch }) {
  const source = safeTarget({ root: configuration.root, relativePath: directory, mustExist: true })
  if (!statSync(source).isDirectory()) return errorResponse(request.id, `${directory} is not a directory.`)
  const archive = createArchive(source)
  const argumentsWithArchive = { ...request.params.arguments, archiveBase64: archive.toString('base64') }
  delete argumentsWithArchive.directory
  return forward({
    request: {
      ...request,
      params: { ...request.params, arguments: argumentsWithArchive },
    },
    configuration,
    requestFetch,
  })
}

async function forward({ request, configuration, requestFetch }) {
  const response = await requestFetch(configuration.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${configuration.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(request),
  })
  const body = await response.text()
  if (!response.ok) {
    const message = response.status === 401
      ? 'Craftspace rejected this member token. Create a new token, then restart Claude Code with CRAFTSPACE_TOKEN set once.'
      : `Craftspace returned HTTP ${response.status}: ${body.slice(0, 300)}`
    return request.id === undefined ? undefined : errorResponse(request.id, message)
  }
  if (request.id === undefined || body.trim() === '') return undefined
  return parseHttpResponse(body)
}

function unconfiguredResponse({ request, message }) {
  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: request.params?.protocolVersion ?? '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'craftspace-local', version: '0.1.0' },
        instructions: message,
      },
    }
  }
  if (request.method === 'tools/list') {
    return { jsonrpc: '2.0', id: request.id, result: { tools: [] } }
  }
  if (request.method === 'ping') return { jsonrpc: '2.0', id: request.id, result: {} }
  return request.id === undefined ? undefined : errorResponse(request.id, message)
}

function parseHttpResponse(body) {
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const data = trimmed
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim()
  if (!data) throw new Error('Craftspace returned an unreadable MCP response.')
  return JSON.parse(data)
}

function parseArchive(archive) {
  let tar
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_EXPANDED_BYTES + MAX_FILES * 512 + 1024 * 1024 })
  } catch {
    throw new Error('The plugin archive is invalid or expands past 60 MB.')
  }
  const files = []
  const seen = new Set()
  let expandedBytes = 0
  let offset = 0
  let pendingPath
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    offset += 512
    if (header.every((byte) => byte === 0)) break
    verifyChecksum(header)
    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 48)
    const content = tar.subarray(offset, offset + size)
    if (content.length !== size) throw new Error('The plugin archive ended inside a file.')
    offset += size + ((512 - (size % 512)) % 512)
    const headerPath = tarPath(header)
    if (type === 'x' || type === 'g') {
      const records = paxRecords(content)
      if (typeof records.path === 'string') pendingPath = records.path
      continue
    }
    if (type === 'L') {
      pendingPath = content.toString('utf8').replace(/\0.*$/, '').trimEnd()
      continue
    }
    if (type === '5') continue
    if (type !== '0' && type !== '\0') throw new Error(`The plugin archive contains an unsupported entry at ${headerPath}.`)
    const path = safePackagePath(pendingPath ?? headerPath)
    pendingPath = undefined
    if (seen.has(path)) throw new Error(`The plugin archive contains ${path} more than once.`)
    if (content.length > MAX_FILE_BYTES) throw new Error(`The plugin file ${path} is larger than 15 MB.`)
    expandedBytes += content.length
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('The plugin package is larger than 60 MB.')
    seen.add(path)
    files.push({ path, content: Buffer.from(content) })
    if (files.length > MAX_FILES) throw new Error(`A plugin package can contain at most ${MAX_FILES} files.`)
  }
  if (files.length === 0) throw new Error('The plugin archive is empty.')
  return files
}

function walkDirectory(root, directory = root) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    const path = relative(root, absolute).split(sep).join('/')
    const state = lstatSync(absolute)
    if (state.isSymbolicLink()) throw new Error(`The plugin path ${path} is a symlink.`)
    safePackagePath(path)
    if (entry.isDirectory()) files.push(...walkDirectory(root, absolute))
    else if (entry.isFile()) {
      if (state.size > MAX_FILE_BYTES) throw new Error(`The plugin file ${path} is larger than 15 MB.`)
      files.push({ path, content: readFileSync(absolute) })
    } else throw new Error(`The plugin path ${path} is not a regular file or directory.`)
    if (files.length > MAX_FILES) throw new Error(`A plugin package can contain at most ${MAX_FILES} files.`)
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function safeTarget({ root, relativePath, mustExist = false }) {
  if (typeof relativePath !== 'string' || relativePath === '' || isAbsolute(relativePath) || relativePath.includes('\\')) {
    throw new Error('Use a relative directory inside the project root.')
  }
  const normalized = posix.normalize(relativePath).replace(/^\.\//, '')
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('Use a relative directory inside the project root.')
  const rootReal = realpathSync(root)
  const target = resolve(rootReal, ...normalized.split('/'))
  let ancestor = target
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error('Could not resolve the plugin directory safely.')
    ancestor = parent
  }
  const ancestorReal = realpathSync(ancestor)
  if (ancestorReal !== rootReal && !ancestorReal.startsWith(`${rootReal}${sep}`)) {
    throw new Error('The plugin directory escapes the project root.')
  }
  if (mustExist && !existsSync(target)) throw new Error(`No plugin directory exists at ${relativePath}.`)
  return target
}

function safePackagePath(value) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`The plugin path ${value} is unsafe.`)
  const normalized = posix.normalize(value).replace(/^\.\//, '')
  const segments = normalized.split('/')
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    segments.some((segment) => segment === '..' || FORBIDDEN_SEGMENTS.has(segment)) ||
    Buffer.byteLength(normalized) > MAX_PATH_BYTES
  ) throw new Error(`The plugin path ${value} is unsafe.`)
  return normalized
}

function tarHeader({ path, size }) {
  const header = Buffer.alloc(512)
  const { name, prefix } = splitTarPath(path)
  writeString(header, name, 0, 100)
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, size, 124, 12)
  writeOctal(header, 0, 136, 12)
  header.fill(32, 148, 156)
  header[156] = 48
  writeString(header, 'ustar', 257, 6)
  writeString(header, '00', 263, 2)
  writeString(header, prefix, 345, 155)
  writeOctal(header, header.reduce((sum, byte) => sum + byte, 0), 148, 8)
  return header
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' }
  const segments = path.split('/')
  const name = segments.pop()
  const prefix = segments.join('/')
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`The plugin path ${path} is too long for a portable archive.`)
  }
  return { name, prefix }
}

function tarPath(header) {
  const name = readString(header, 0, 100)
  const prefix = readString(header, 345, 155)
  return prefix ? `${prefix}/${name}` : name
}

function paxRecords(content) {
  const records = {}
  let offset = 0
  while (offset < content.length) {
    const space = content.indexOf(32, offset)
    if (space < 0) break
    const length = Number(content.subarray(offset, space).toString('ascii'))
    if (!Number.isInteger(length) || length <= 0 || offset + length > content.length) break
    const record = content.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return records
}

function verifyChecksum(header) {
  const supplied = readOctal(header, 148, 8)
  const copy = Buffer.from(header)
  copy.fill(32, 148, 156)
  const actual = copy.reduce((sum, byte) => sum + byte, 0)
  if (supplied !== actual) throw new Error('The plugin archive has an invalid tar checksum.')
}

function readString(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/, '')
}

function readOctal(buffer, offset, length) {
  const value = readString(buffer, offset, length).trim()
  const parsed = Number.parseInt(value || '0', 8)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('The plugin archive has an invalid tar header.')
  return parsed
}

function writeString(target, value, offset, length) {
  target.write(value, offset, length, 'utf8')
}

function writeOctal(target, value, offset, length) {
  const encoded = value.toString(8).padStart(length - 2, '0')
  target.write(`${encoded}\0 `, offset, length, 'ascii')
}

function tokenFile({ root, org, args, project, pluginData }) {
  const configured = args.tokenFile ?? project.tokenFile
  if (typeof configured === 'string') return isAbsolute(configured) ? configured : resolve(root, configured)
  if (typeof pluginData === 'string' && pluginData !== '') return join(pluginData, 'tokens', org)
  return undefined
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    const value = values[index + 1]
    if (!key.startsWith('--') || value === undefined) continue
    parsed[key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value
    index += 1
  }
  return parsed
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function errorResponse(id, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message } }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
