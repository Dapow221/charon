import { Connection } from '@solana/web3.js';
import WebSocket from 'ws';
import { config, PUMP_AMM, PUMP_PROGRAM } from './config.js';
import { hasFeeClaimLog, hasPumpEventLog, parsePumpEvents } from './pumpParser.js';
import type { PumpEvent } from './types.js';

export type PumpEventHandler = (event: PumpEvent) => Promise<void>;

export function makeConnection(): Connection {
  return new Connection(config.solanaRpcUrl, 'confirmed');
}

export function startSolanaWatcher(connection: Connection, handler: PumpEventHandler): void {
  void connection;
  let ws: WebSocket | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  const seen = new Map<string, number>();

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
      if (config.watchPumpAmm) subscribe(socket, 2, PUMP_AMM);
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.ping();
      }, 30_000);
    });

    socket.on('message', (raw) => {
      void processMessage(raw.toString(), seen, handler).catch((err) => {
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

async function processMessage(
  raw: string,
  seen: Map<string, number>,
  handler: PumpEventHandler,
): Promise<void> {
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
  const events = parsePumpEvents(signature, logs);
  for (const event of events) await handler(event);
}

function isPotentialAlertLog(logs: string[]): boolean {
  return hasFeeClaimLog(logs) || hasPumpEventLog(logs);
}
