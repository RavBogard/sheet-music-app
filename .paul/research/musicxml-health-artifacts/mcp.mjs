// MusicXML health audit — reusable MCP client (pool ROOT bearer)
import { promises as fs } from 'fs'

export const BASE_URL = 'https://www.centralreform.live'

export async function readRootBearer() {
  const raw = await fs.readFile('C:/Users/dsbog/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers', 'utf8')
  const line = raw.split(/\r?\n/).find(l => /ASSIGNMENT=root\b/.test(l) && !/^#/.test(l))
  if (!line) throw new Error('root bearer not found')
  return line.split(/\s+/)[0]
}

// JSON-RPC tools/call; returns parsed inner content (the tool's JSON result)
export async function mcp(bearer, name, args = {}, id = Math.floor(Math.random() * 1e6)) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  })
  const raw = await res.text()
  const m = raw.match(/data: ({[\s\S]*})\s*$/m)
  const payload = m ? m[1] : raw
  let outer
  try { outer = JSON.parse(payload) } catch { return { __httpStatus: res.status, __raw: raw.slice(0, 1200) } }
  if (outer.error) return { __rpcError: outer.error, __httpStatus: res.status }
  const txt = outer?.result?.content?.[0]?.text
  if (typeof txt === 'string') { try { return JSON.parse(txt) } catch { return { __text: txt } } }
  return outer.result ?? outer
}

export async function toolsList(bearer) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  const raw = await res.text()
  const m = raw.match(/data: ({[\s\S]*})\s*$/m)
  const outer = JSON.parse(m ? m[1] : raw)
  return (outer.result?.tools || []).map(t => t.name)
}

// CLI: node mcp.mjs <boot|tools>
if (process.argv[1] && process.argv[1].endsWith('mcp.mjs')) {
  const cmd = process.argv[2] || 'boot'
  const bearer = await readRootBearer()
  const ver = await fetch(`${BASE_URL}/api/version`).then(r => r.json()).catch(e => ({ err: String(e) }))
  console.log('[prod sha]', ver.sha || JSON.stringify(ver))
  if (cmd === 'tools') {
    const names = await toolsList(bearer)
    console.log('[tools]', names.length)
    console.log(names.join('\n'))
  }
}
