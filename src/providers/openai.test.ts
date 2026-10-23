import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiStreamParser, buildMessages, describeFetchError } from './openai';

// PRD § 10.4: parse SSE (teks + tool_calls), supports_tools=false → json_exec

test('teks dirakit dari beberapa potongan SSE', () => {
  const parser = new OpenAiStreamParser();
  const seen: string[] = [];
  for (const piece of ['halo ', 'dunia']) {
    parser.push(JSON.stringify({ choices: [{ delta: { content: piece } }] }), t => seen.push(t));
  }
  parser.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));

  const result = parser.result();
  assert.equal(result.text, 'halo dunia');
  assert.deepEqual(seen, ['halo ', 'dunia']);
  assert.equal(result.stopReason, 'done');
  assert.deepEqual(result.usage, { prompt: 10, completion: 2 });
  assert.equal(result.toolCalls.length, 0);
});

test('tool_calls dirakit dari delta bertahap', () => {
  const parser = new OpenAiStreamParser();
  parser.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'run_command', arguments: '{"comm' } }] } }] }));
  parser.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'and":"ls -la"}' } }] }, finish_reason: 'tool_calls' }] }));

  const result = parser.result();
  assert.equal(result.stopReason, 'tool');
  assert.deepEqual(result.toolCalls, [{ id: 'call_1', name: 'run_command', args: { command: 'ls -la' } }]);
});

test('argumen tool yang rusak tidak membuat sesi mati', () => {
  const parser = new OpenAiStreamParser();
  parser.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'run_command', arguments: '{"command": ' } }] } }] }));
  const result = parser.result();
  assert.equal(result.toolCalls.length, 1);
  assert.deepEqual(result.toolCalls[0].args, {});
});

test('supports_tools=false memakai protokol json_exec', () => {
  const messages = buildMessages('sys', [
    { role: 'user', content: 'kerjakan' },
    { role: 'assistant', content: 'cek dulu', toolCalls: [{ id: 'c1', name: 'run_command', args: { command: 'ls' } }] },
    { role: 'tool', content: 'exit code: 0', toolCallId: 'c1' },
  ], false) as Array<Record<string, unknown>>;

  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].content, 'kerjakan');
  assert.match(String(messages[2].content), /json_exec/);
  assert.equal(messages.some(m => m.role === 'tool'), false);
  assert.match(String(messages[3].content), /\[HASIL TOOL\]/);
});

test('supports_tools=true memakai function calling', () => {
  const messages = buildMessages('sys', [
    { role: 'user', content: 'kerjakan' },
    { role: 'assistant', content: 'cek dulu', toolCalls: [{ id: 'c1', name: 'run_command', args: { command: 'ls' } }] },
    { role: 'tool', content: 'exit code: 0', toolCallId: 'c1' },
  ], true) as Array<Record<string, unknown>>;

  const assistant = messages.find(m => m.role === 'assistant') as Record<string, any>;
  assert.equal(assistant.tool_calls[0].id, 'c1');
  assert.equal(assistant.tool_calls[0].function.name, 'run_command');
  const tool = messages.find(m => m.role === 'tool') as Record<string, unknown>;
  assert.equal(tool.tool_call_id, 'c1');
});

test('error jaringan diterjemahkan jadi pesan yang bisa ditindaklanjuti', () => {
  const refused = new TypeError('fetch failed', { cause: Object.assign(new AggregateError([{ code: 'ECONNREFUSED' }]), { code: undefined }) });
  assert.match(describeFetchError(refused), /koneksi ditolak/);
  const dns = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  assert.match(describeFetchError(dns), /DNS gagal/);
  const badPort = new TypeError('fetch failed', { cause: { message: 'bad port' } });
  assert.equal(describeFetchError(badPort), 'fetch failed (bad port)');
});
