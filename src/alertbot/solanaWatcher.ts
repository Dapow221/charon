import { Connection } from '@solana/web3.js';
import WebSocket from 'ws';
import { config, PUMP_AMM, PUMP_PROGRAM } from './config.js';
import { parsePumpEvents } from './pumpParser.js';
import type { PumpEvent } from './types.js';

export type PumpEventHandler = (event: PumpEvent) => Promise<void>;
type QueuedLog = { signature: string; logs: string[] };

export function makeConnection(): Connection {
  return new Connection(config.solanaRpcUrl, 'confirmed');
}

export function startSolanaWatcher(connection: Connection, handler: PumpEventHandler): void {
  let ws: WebSocket | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  const seen = new Map<string, number>();
  const queue: QueuedLog[] = [];
  let processing = false;

  function pruneSeen(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, at] of seen) {
      if (at < cutoff) seen.delete(key);
    }
  }

  function connect(): void {
    const socket = new WebSocket(config.solanaWsUrl);
    ws = socket;

    socket.on('open', () => {
      console.log('[alertbot] websocket connected');
      subscribe(socket, 1, PUMP_PROGRAM);
      subscribe(socket, 2, PUMP_AMM);
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.ping();
      }, 30_000);
    });

    socket.on('message', (raw) => {
      processMessage(raw.toString(), seen, queue);
      void drainQueue(connection, queue, handler, () => processing, (value) => {
        processing = value;
      }).catch((err) => {
        console.log(`[alertbot] message failed: ${err.message}`);
      });
    });

    socket.on('close', () => {
      if (pingTimer) clearInterval(pingTimer);
      pruneSeen();
      console.log('[alertbot] websocket closed, reconnecting in 5s');
      setTimeout(connect, 5_000);
    });

    socket.on('error', (err) => {
      console.log(`[alertbot] websocket error: ${err.message}`);
    });
  }

  connect();
}

function subscribe(ws: WebSocket, id: number, program: string): void {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'logsSubscribe',
    params: [{ mentions: [program] }, { commitment: 'confirmed' }],
  }));
}

function processMessage(
  raw: string,
  seen: Map<string, number>,
  queue: QueuedLog[],
): void {
  let message: any;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  const value = message.params?.result?.value;
  if (message.method !== 'logsNotification' || !value || value.err || !value.signature) return;

  const signature = String(value.signature);
  if (seen.has(signature)) return;
  seen.set(signature, Date.now());

  const logs = Array.isArray(value.logs) ? value.logs.map(String) : [];
  if (!isPotentialAlertLog(logs)) return;
  if (queue.length >= config.rpcQueueMaxSize) {
    console.log(`[alertbot] RPC queue full (${queue.length}); dropping ${signature.slice(0, 8)}`);
    return;
  }
  queue.push({ signature, logs });
}

async function drainQueue(
  connection: Connection,
  queue: QueuedLog[],
  handler: PumpEventHandler,
  isProcessing: () => boolean,
  setProcessing: (value: boolean) => void,
): Promise<void> {
  if (isProcessing()) return;
  setProcessing(true);
  try {
    while (queue.length) {
      const item = queue.shift();
      if (!item) continue;
      const events = await parsePumpEvents(connection, item.signature, item.logs);
      for (const event of events) await handler(event);
      await sleep(config.rpcRequestDelayMs);
    }
  } finally {
    setProcessing(false);
  }
}

function isPotentialAlertLog(logs: string[]): boolean {
  return logs.some(line => (
    line.startsWith('Program data: ') ||
    /Instruction:\s*(Buy|Create|CreateV2|InitializeMint)/i.test(line)
  ));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
