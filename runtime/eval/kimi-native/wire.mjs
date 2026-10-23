import { appendFileSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const totalBalance = b => b.cash_balance + b.voucher_balance;
export function reconcile(ledger, balance) {
  for (const name of ['cash_balance', 'voucher_balance', 'available_balance']) {
    if (!Number.isFinite(balance[name])) throw new Error('Invalid Moonshot balance');
  }
  const delta = totalBalance(ledger.lastBalance) - totalBalance(balance);
  return { ...ledger, spent: ledger.spent + Math.max(0, delta), lastBalance: balance };
}
export function reserveUsd(body) {
  const output = body.max_completion_tokens ?? body.max_tokens;
  if (!Number.isInteger(output) || output < 1 || output > 4096) throw new Error('Unbounded sweep output');
  // Admission envelope, not a published model price. UTF-8 bytes upper-bound
  // text tokens. Image requests add a separate conservative token reserve.
  const images = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(p => p.type === 'image_url').length;
  return (Buffer.byteLength(JSON.stringify(body)) + images * 32000) * 30 / 1e6 + output * 100 / 1e6;
}
export function admit(ledger, body) {
  if (ledger.pending) throw new Error('Unsettled request reservation');
  const reserve = reserveUsd(body);
  if (ledger.spent + reserve > ledger.cap) throw new Error('Owner spend cap reached');
  return reserve;
}

const controlPath = process.env.KIMI_SWEEP_CONTROL;
if (controlPath) {
  const original = globalThis.fetch;
  const key = process.env.MOONSHOT_API_KEY;
  const save = (file, value) => {
    writeFileSync(file+'.tmp', JSON.stringify(value, null, 2)+'\n', {mode: 0o600});
    renameSync(file+'.tmp', file);
  };
  async function balance() {
    const r = await original('https://api.moonshot.ai/v1/users/me/balance', {
      headers: {Authorization: 'Bearer '+key}, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error('Balance lookup failed');
    return (await r.json()).data;
  }
  let queue = Promise.resolve();
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (url !== 'https://api.moonshot.ai/v1/chat/completions') return original(input, init);
    // A single active request keeps reservations and balance deltas attributable.
    const prior = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await prior;
    let streaming = false;
    const control = JSON.parse(readFileSync(controlPath, 'utf8'));
    const log = entry => appendFileSync(control.wire, JSON.stringify({...entry, run: control.run})+'\n', {mode: 0o600});
    try {
      const body = JSON.parse(String(init?.body));
      let ledger = reconcile(JSON.parse(readFileSync(control.ledger, 'utf8')), await balance());
      save(control.ledger, ledger);
      if (ledger.lastBalance.available_balance <= 0 && !control.quotaProbe) throw new Error('Moonshot account needs funding');
      const reserve = admit(ledger, body);
      ledger = {...ledger, pending: {run: control.run, reserve}};
      save(control.ledger, ledger);
      const started = Date.now();
      const entry = {started, model: body.model, bytes: Buffer.byteLength(JSON.stringify(body)),
        maxOutput: body.max_completion_tokens ?? body.max_tokens, effort: body.reasoning_effort,
        thinking: body.thinking, stream: body.stream,
        images: body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(p => p.type === 'image_url').length,
        messages: body.messages.map(m => ({role: m.role, toolCallId: m.tool_call_id,
          reasoningHash: m.reasoning_content === undefined ? undefined : digest(m.reasoning_content),
          reasoningLength: m.reasoning_content?.length,
          // Tool output evidence is generated solely by the isolated fixtures.
          toolOutput: m.role === 'tool' ? String(m.content).slice(0, 12000) : undefined,
          toolCalls: m.tool_calls})), reserve};
      const response = await original(input, init);
      // Tee capture preserves the CLI stream. The daemon owns this task until
      // its response is fully drained. The runner waits for the ledger to settle.
      const capture = async () => {
        const raw = await response.clone().text();
        const chunks = body.stream && response.ok
          ? raw.split('\n').filter(s => s.startsWith('data: ') && s !== 'data: [DONE]').map(s => JSON.parse(s.slice(6)))
          : [JSON.parse(raw)];
        let reasoning = '';
        const calls = new Map();
        for (const chunk of chunks) {
          if (chunk.usage) entry.usage = chunk.usage;
          if (chunk.error) entry.error = {type: chunk.error.type,
            message: String(chunk.error.message ?? '').replaceAll(key ?? '\0', '[redacted]')
              .replace(/org-[a-z0-9]+|<ak-[^>]+>/gi, '[account]')};
          for (const choice of chunk.choices ?? []) {
            const m = choice.delta ?? choice.message ?? {};
            reasoning += m.reasoning_content ?? '';
            if (choice.finish_reason) entry.finish = choice.finish_reason;
            for (const [offset, c] of (m.tool_calls ?? []).entries()) {
              const i = c.index ?? offset;
              const prev = calls.get(i) ?? {id: '', name: '', arguments: ''};
              prev.id += c.id ?? ''; prev.name += c.function?.name ?? ''; prev.arguments += c.function?.arguments ?? '';
              calls.set(i, prev);
            }
          }
        }
        const after = await balance();
        const settled = reconcile(ledger, after);
        delete settled.pending;
        save(control.ledger, settled);
        log({...entry, status: response.status, secs: (Date.now()-started)/1000,
          reasoningHash: digest(reasoning), reasoningLength: reasoning.length, tools: [...calls.values()],
          balanceBefore: ledger.lastBalance, balanceAfter: after,
          cost: Math.max(0, totalBalance(ledger.lastBalance)-totalBalance(after)), spent: settled.spent});
      };
      if (!response.ok) await capture();
      else {
        streaming = true;
        void capture().catch(() => log({status: 'capture-error'})).finally(release);
        return response;
      }
      return response;
    } catch (error) {
      // No request headers, request objects or credential values are logged.
      log({status: 'guard-or-transport-error', error: error instanceof Error ? error.message.replaceAll(key ?? '\0', '[redacted]') : 'unknown'});
      throw error;
    } finally {
      // A successful streamed request keeps the reservation until capture ends.
      if (!streaming) release();
    }
  };
}
