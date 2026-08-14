import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  createArchive,
  extractArchive,
  handleRequest,
  loadConfiguration,
} from './craftspace-mcp.mjs'

const temporary = []

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
})

test('an unconfigured local server initializes without advertising duplicate tools', async () => {
  const initialized = await handleRequest({
    request: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    configuration: { error: 'Add .craftspace.json.' },
  })
  const listed = await handleRequest({
    request: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    configuration: { error: 'Add .craftspace.json.' },
  })

  assert.equal(initialized.result.serverInfo.name, 'craftspace-local')
  assert.match(initialized.result.instructions, /\.craftspace\.json/)
  assert.deepEqual(listed.result.tools, [])
})

test('configuration pins the org and persists an environment token outside the project', () => {
  const root = temp()
  const pluginData = temp()
  writeFileSync(join(root, '.craftspace.json'), '{"org":"acme"}\n')
  const configuration = loadConfiguration({
    root,
    environment: {
      CRAFTSPACE_PLUGIN_DATA: pluginData,
      CRAFTSPACE_TOKEN: 'cst_example',
      CRAFTSPACE_MCP_URL: 'https://example.test/mcp',
    },
  })

  assert.equal(configuration.endpoint, 'https://example.test/mcp/acme')
  assert.equal(configuration.token, 'cst_example')
  assert.equal(readFileSync(join(pluginData, 'tokens', 'acme'), 'utf8'), 'cst_example\n')
})

test('archives round-trip below the root and refuse overwrite or symlinks', () => {
  const root = temp()
  const source = join(root, 'source')
  mkdirSync(join(source, '.claude-plugin'), { recursive: true })
  mkdirSync(join(source, 'skills', 'interview'), { recursive: true })
  writeFileSync(join(source, '.claude-plugin', 'plugin.json'), '{"name":"research"}')
  writeFileSync(join(source, 'skills', 'interview', 'SKILL.md'), 'steps')
  const archive = createArchive(source)

  assert.equal(extractArchive({ archive, destination: 'plugins/research', root }), 2)
  assert.equal(readFileSync(join(root, 'plugins', 'research', 'skills', 'interview', 'SKILL.md'), 'utf8'), 'steps')
  assert.throws(() => extractArchive({ archive, destination: 'plugins/research', root }), /not empty/)
  assert.throws(() => extractArchive({ archive, destination: '../outside', root }), /inside the project root/)

  const linked = join(root, 'linked')
  symlinkSync(source, linked)
  assert.throws(() => createArchive(linked), /symlink|realpath/i)
})

test('directory calls download locally and upload an archive upstream', async () => {
  const root = temp()
  const source = join(root, 'source')
  mkdirSync(join(source, '.claude-plugin'), { recursive: true })
  mkdirSync(join(source, 'skills', 'interview'), { recursive: true })
  writeFileSync(join(source, '.claude-plugin', 'plugin.json'), '{"name":"research"}')
  writeFileSync(join(source, 'skills', 'interview', 'SKILL.md'), 'steps')
  const archive = createArchive(source)
  const sha256 = (await import('node:crypto')).createHash('sha256').update(archive).digest('hex')
  let uploaded
  const requestFetch = async (url, options) => {
    if (url === 'https://download.test/research.tar.gz') return new Response(archive)
    const body = JSON.parse(options.body)
    if (body.params.arguments.archiveBase64 !== undefined) uploaded = body.params.arguments.archiveBase64
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: {
          downloadUrl: 'https://download.test/research.tar.gz',
          sha256,
          revision: 'abc123abc123',
        },
      },
    })
  }
  const configuration = {
    root,
    endpoint: 'https://craftspace.test/mcp/acme',
    token: 'cst_example',
  }
  const downloaded = await handleRequest({
    request: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'download_plugin', arguments: { pluginId: 'custom-1', directory: 'downloaded' } },
    },
    configuration,
    requestFetch,
  })
  const upserted = await handleRequest({
    request: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'upsert_plugin', arguments: { pluginId: 'custom-1', directory: 'source' } },
    },
    configuration,
    requestFetch,
  })

  assert.equal(downloaded.result.structuredContent.writtenTo, 'downloaded')
  assert.equal(upserted.result.content[0].text, 'ok')
  assert.equal(Buffer.from(uploaded, 'base64').equals(archive), true)
})

function temp() {
  const directory = mkdtempSync(join(tmpdir(), 'craftspace-local-mcp-'))
  temporary.push(directory)
  chmodSync(directory, 0o700)
  return directory
}
