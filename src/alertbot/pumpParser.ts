import { DISC_DIST_FEES, DISC_PUMP_CREATE, DISC_PUMP_TRADE } from './config.js';
import type { FeeClaimEvent, PumpBuyEvent, PumpDeployEvent, PumpEvent } from './types.js';
import { discMatch, lamportsToSol, readPubkey } from './utils.js';

export function parseFeeClaimFromLogs(signature: string, logs: string[], blockTimeMs: number): FeeClaimEvent | null {
  for (const line of logs) {
    const data = feeClaimDataFromLog(line);
    if (!data) continue;
    let offset = 8 + 8;
    const mint = readPubkey(data, offset); offset += 32;
    offset += 32; // bonding curve
    offset += 32; // sharing config
    offset += 32; // admin
    const count = data.readUInt32LE(offset); offset += 4;
    const recipients: FeeClaimEvent['recipients'] = [];
    for (let i = 0; i < count && offset + 34 <= data.length; i++) {
      const address = readPubkey(data, offset); offset += 32;
      const bps = data.readUInt16LE(offset); offset += 2;
      recipients.push({ address, bps, percent: bps / 100 });
    }
    const distributedLamports = data.length >= offset + 8 ? data.readBigUInt64LE(offset) : 0n;
    return {
      kind: 'fee_claim',
      signature,
      mint,
      distributedSol: lamportsToSol(distributedLamports),
      recipients,
      blockTimeMs,
    };
  }
  return null;
}

export function hasFeeClaimLog(logs: string[]): boolean {
  return logs.some(line => Boolean(feeClaimDataFromLog(line)));
}

export function hasPumpEventLog(logs: string[]): boolean {
  return logs.some(line => {
    const data = programDataFromLog(line);
    return Boolean(data && (discMatch(data, DISC_PUMP_TRADE) || discMatch(data, DISC_PUMP_CREATE)));
  });
}

export function parsePumpEvents(signature: string, logs: string[]): PumpEvent[] {
  const blockTimeMs = Date.now();
  const feeClaim = parseFeeClaimFromLogs(signature, logs, blockTimeMs);
  const pumpEvents = parsePumpEventLogs(signature, logs);
  return [...(feeClaim ? [feeClaim] : []), ...pumpEvents];
}

function parsePumpEventLogs(signature: string, logs: string[]): Array<PumpBuyEvent | PumpDeployEvent> {
  const events: Array<PumpBuyEvent | PumpDeployEvent> = [];
  for (const line of logs) {
    const data = programDataFromLog(line);
    if (!data) continue;
    const trade = parseTradeEvent(signature, data);
    if (trade) events.push(trade);
    const deploy = parseCreateEvent(signature, data);
    if (deploy) events.push(deploy);
  }
  return events;
}

function parseTradeEvent(signature: string, data: Buffer): PumpBuyEvent | null {
  if (data.length < 153 || !discMatch(data, DISC_PUMP_TRADE)) return null;
  let offset = 8;
  const mint = readPubkey(data, offset); offset += 32;
  const solAmount = lamportsToSol(data.readBigUInt64LE(offset)); offset += 8;
  const tokenAmount = Number(data.readBigUInt64LE(offset)); offset += 8;
  const isBuy = data.readUInt8(offset) === 1; offset += 1;
  const wallet = readPubkey(data, offset); offset += 32;
  const timestamp = Number(data.readBigInt64LE(offset));
  if (!isBuy) return null;
  return {
    kind: 'buy',
    signature,
    wallet,
    mint,
    solAmount,
    tokenAmount,
    blockTimeMs: timestamp > 0 ? timestamp * 1000 : Date.now(),
  };
}

function parseCreateEvent(signature: string, data: Buffer): PumpDeployEvent | null {
  if (data.length < 8 || !discMatch(data, DISC_PUMP_CREATE)) return null;
  let offset = 8;
  const name = readAnchorString(data, offset); offset = name.nextOffset;
  const symbol = readAnchorString(data, offset); offset = symbol.nextOffset;
  const uri = readAnchorString(data, offset); offset = uri.nextOffset;
  void name;
  void symbol;
  void uri;
  if (offset + 96 > data.length) return null;
  const mint = readPubkey(data, offset); offset += 32;
  offset += 32; // bonding curve
  const wallet = readPubkey(data, offset);
  return {
    kind: 'deploy',
    signature,
    wallet,
    mint,
    blockTimeMs: Date.now(),
  };
}

function readAnchorString(data: Buffer, offset: number): { value: string; nextOffset: number } {
  if (offset + 4 > data.length) return { value: '', nextOffset: data.length };
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = Math.min(start + length, data.length);
  return { value: data.subarray(start, end).toString('utf8'), nextOffset: end };
}

function feeClaimDataFromLog(line: string): Buffer | null {
  const data = programDataFromLog(line);
  if (!data || data.length < 148 || !discMatch(data, DISC_DIST_FEES)) return null;
  return data;
}

function programDataFromLog(line: string): Buffer | null {
  if (!line.startsWith('Program data: ')) return null;
  try {
    return Buffer.from(line.slice('Program data: '.length), 'base64');
  } catch {
    return null;
  }
}
