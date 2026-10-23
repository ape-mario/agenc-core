import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { admit, reconcile, totalBalance, usageCost, budgetSpend, reserveUsd } from './wire.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const balance = cash => ({cash_balance: cash, voucher_balance: 0, available_balance: Math.max(0, cash)});
const request = {messages: [{role: 'user', content: 'hello'}], max_completion_tokens: 4096};
test('cash debt is visible even when available balance is clamped to zero', () => {
  const ledger = {spent: 0.19, lastBalance: balance(-0.09)};
  const next = reconcile(ledger, balance(-0.14));
  assert.ok(Math.abs(next.spent-0.24)<1e-9);
  assert.equal(totalBalance(next.lastBalance), -0.14);
});
test('funding never resets cumulative owner spend', () => {
  const ledger = reconcile({spent: 2, lastBalance: balance(0)}, balance(20));
  assert.equal(ledger.spent, 2);
  assert.equal(reconcile(ledger, balance(19)).spent, 3);
});
test('admission includes prior spend and outstanding output', () => {
  assert.throws(() => admit({spent: 19.9, cap: 20}, request), /cap/);
  assert.ok(admit({spent: 0.191416725, cap: 20}, request)>0.16384);
  assert.throws(() => admit({spent: 0, cap: 20, pending: {}}, request), /Unsettled/);
  assert.throws(() => admit({spent: 0, cap: 20}, {...request, max_completion_tokens: undefined}), /Unbounded/);
  assert.throws(() => admit({spent: 0, cap: 20}, {...request, max_completion_tokens: 131072}), /Unbounded/);
  assert.throws(() => reconcile({spent: 0, lastBalance: balance(1)}, {available_balance: 0}), /Invalid/);
});

test('admission preserves the account floor as well as the cumulative owner cap', () => {
  const ledger = {spent: 20, cap: 24, balanceFloor: 1, lastBalance: balance(1.1)};
  assert.throws(() => admit(ledger, request), /balance floor/);
  assert.ok(admit({...ledger, lastBalance: balance(2)}, request) > 0);
  assert.throws(() => admit({...ledger, spent: 23.9, lastBalance: balance(10)}, request), /cap/);
});

test('stream capture preserves reasoning, joins tool fragments and settles before the next call', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kimi-wire-'));
  const priorFetch = globalThis.fetch;
  const priorControl = process.env.KIMI_SWEEP_CONTROL;
  const priorKey = process.env.MOONSHOT_API_KEY;
  let cash = 10;
  let calls = 0;
  let estimates = 0;
  const ledger = join(root, 'ledger.json');
  const wire = join(root, 'wire.jsonl');
  const control = join(root, 'control.json');
  writeFileSync(ledger, JSON.stringify({cap:20,spent:0.191416725,lastBalance:balance(cash)}));
  writeFileSync(control, JSON.stringify({run:'test',ledger,wire,quotaProbe:false}));
  process.env.KIMI_SWEEP_CONTROL = control;
  process.env.MOONSHOT_API_KEY = 'test-only-secret';
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/balance')) return Response.json({data:balance(cash)});
    if (String(url).endsWith('/estimate-token-count')) {
      estimates++;
      assert.equal(JSON.parse(init.body).messages[0].content.length, 100000);
      return Response.json({data:{total_tokens:25000}});
    }
    calls++;
    cash -= 0.01;
    return new Response([
      {choices:[{delta:{reasoning_content:'Inspect ',tool_calls:[{index:0,id:'a',function:{name:'FileRead',arguments:'{"pa'}}]}}]},
      {choices:[{delta:{reasoning_content:'files',tool_calls:[{index:0,function:{arguments:'th":"x"}'}}]},finish_reason:'tool_calls'}]},
      {choices:[],usage:{prompt_tokens:100,completion_tokens:10}},
    ].map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n');
  };
  try {
    await import('./wire.mjs?capture-test');
    const init = {method:'POST',body:JSON.stringify({...request,model:'kimi-k3',stream:true})};
    const [a,b] = await Promise.all([globalThis.fetch('https://api.moonshot.ai/v1/chat/completions',init),
      globalThis.fetch('https://api.moonshot.ai/v1/chat/completions',init)]);
    assert.match(await a.text(), /reasoning_content/);
    await b.text();
    for (let i=0; i<50 && JSON.parse(readFileSync(ledger)).pending; i++) await new Promise(r=>setTimeout(r,5));
    const saved = JSON.parse(readFileSync(ledger));
    assert.equal(calls,2);
    assert.equal(saved.pending,undefined);
    assert.ok(Math.abs(saved.spent-0.211416725)<1e-9);
    const events = readFileSync(wire,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.length,2);
    assert.equal(events[0].reasoningLength,13);
    assert.deepEqual(events[0].tools,[{id:'a',name:'FileRead',arguments:'{"path":"x"}'}]);
    assert.ok(Math.abs(saved.usageSpend - 0.0009) < 1e-9);
    const large = await globalThis.fetch('https://api.moonshot.ai/v1/chat/completions', {
      method:'POST', body:JSON.stringify({...request,model:'kimi-k3',stream:true,
        messages:[{role:'user',content:'x'.repeat(100000)}]}),
    });
    await large.text();
    for (let i=0; i<50 && JSON.parse(readFileSync(ledger)).pending; i++) await new Promise(r=>setTimeout(r,5));
    assert.equal(estimates,1);
    const calibrated = readFileSync(wire,'utf8').trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(calibrated.inputTokenBound,28527);
    assert.equal(calls,3);
    assert.ok(!readFileSync(wire,'utf8').includes('test-only-secret'));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorControl === undefined) delete process.env.KIMI_SWEEP_CONTROL; else process.env.KIMI_SWEEP_CONTROL = priorControl;
    if (priorKey === undefined) delete process.env.MOONSHOT_API_KEY; else process.env.MOONSHOT_API_KEY = priorKey;
    rmSync(root,{recursive:true,force:true});
  }
});

test('delayed balance settlement cannot erase priced usage or double-count it', () => {
  const usage = {prompt_tokens:100000, completion_tokens:1000, prompt_tokens_details:{cached_tokens:60000,cache_write_tokens:30000}};
  assert.equal(usageCost('kimi-k3.1-pro', usage), 0.102);
  assert.equal(usageCost('kimi-k3.1-pro-highspeed', usage), 0.192);
  assert.throws(() => usageCost('unknown', usage), /Missing/);
  assert.throws(() => usageCost('kimi-k3', {}), /Missing/);
  const ledger = {spent:0.19,priorSpend:0.19,usageSpend:20,cap:22,lastBalance:balance(25),balanceFloor:1};
  assert.throws(() => admit(ledger, request), /cap/);
  const settled = reconcile(ledger, balance(5));
  assert.ok(Math.abs(budgetSpend(settled)-22.19)<1e-9);
});

test('large-request token bounds preserve output reservations and reject invalid estimates', () => {
  const large = {...request, messages:[{role:'user',content:'x'.repeat(300000)}]};
  assert.equal(reserveUsd(large, 110000), 1.32 + 0.16384);
  assert.ok(reserveUsd(large) > reserveUsd(large, 110000));
  for (const invalid of [0, -1, NaN, 2.5]) assert.throws(() => reserveUsd(large, invalid), /Invalid/);
  assert.throws(() => admit({cap:1,spent:0}, large,110000), /cap/);
});
