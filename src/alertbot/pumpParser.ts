import type { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import { DISC_DIST_FEES, PUMP_PROGRAM, WSOL_MINT } from './config.js';
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

export async function parsePumpTransaction(
  connection: Connection,
  signature: string,
  logs: string[],
): Promise<Array<PumpBuyEvent | PumpDeployEvent>> {
  if (!shouldFetchParsedTransaction(logs)) return [];

  const tx = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta || tx.meta.err) return [];

  const eventTime = (tx.blockTime || Math.floor(Date.now() / 1000)) * 1000;
  const feePayer = feePayerAddress(tx);
  if (!feePayer) return [];

  const events: Array<PumpBuyEvent | PumpDeployEvent> = [];
  const buy = inferBuy(tx, signature, feePayer, eventTime);
  if (buy) events.push(buy);

  const isCreate = logs.some(line => /Instruction:\s*(Create|InitializeMint|CreateV2)/i.test(line));
  const deployedMint = isCreate ? inferMint(tx, feePayer) : null;
  if (deployedMint) {
    events.push({
      kind: 'deploy',
      signature,
      wallet: feePayer,
      mint: deployedMint,
      blockTimeMs: eventTime,
    });
  }

  return events;
}

export function shouldFetchParsedTransaction(logs: string[]): boolean {
  const hasPumpProgram = logs.some(line => line.includes(PUMP_PROGRAM) || line.toLowerCase().includes('pump'));
  if (!hasPumpProgram) return false;
  return logs.some(line => /Instruction:\s*(Buy|Create|CreateV2|InitializeMint)/i.test(line));
}

function feeClaimDataFromLog(line: string): Buffer | null {
  if (!line.startsWith('Program data: ')) return null;
  let data: Buffer;
  try {
    data = Buffer.from(line.slice('Program data: '.length), 'base64');
  } catch {
    return null;
  }
  if (data.length < 148 || !discMatch(data, DISC_DIST_FEES)) return null;
  return data;
}

function feePayerAddress(tx: ParsedTransactionWithMeta): string | null {
  const keys = tx.transaction.message.accountKeys as any[];
  const signer = keys.find(key => key.signer);
  return signer?.pubkey?.toBase58?.() || signer?.pubkey?.toString?.() || null;
}

function inferBuy(tx: ParsedTransactionWithMeta, signature: string, wallet: string, blockTimeMs: number): PumpBuyEvent | null {
  const meta = tx.meta;
  if (!meta) return null;
  const keys = tx.transaction.message.accountKeys as any[];
  const walletIndex = keys.findIndex(key => (key.pubkey?.toBase58?.() || key.pubkey?.toString?.()) === wallet);
  if (walletIndex < 0) return null;

  const preLamports = Number(meta.preBalances[walletIndex] || 0);
  const postLamports = Number(meta.postBalances[walletIndex] || 0);
  const solSpent = lamportsToSol(Math.max(0, preLamports - postLamports - Number(meta.fee || 0)));
  if (solSpent <= 0) return null;

  const tokenDelta = largestTokenIncreaseForOwner(meta.preTokenBalances || [], meta.postTokenBalances || [], wallet);
  if (!tokenDelta || tokenDelta.mint === WSOL_MINT) return null;

  return {
    kind: 'buy',
    signature,
    wallet,
    mint: tokenDelta.mint,
    solAmount: solSpent,
    tokenAmount: tokenDelta.delta,
    blockTimeMs,
  };
}

function largestTokenIncreaseForOwner(preBalances: any[], postBalances: any[], owner: string): { mint: string; delta: number } | null {
  const before = new Map<string, number>();
  for (const row of preBalances) {
    if (row.owner !== owner || row.mint === WSOL_MINT) continue;
    before.set(row.mint, (before.get(row.mint) || 0) + uiAmount(row));
  }

  let best: { mint: string; delta: number } | null = null;
  for (const row of postBalances) {
    if (row.owner !== owner || row.mint === WSOL_MINT) continue;
    const after = uiAmount(row);
    const delta = after - (before.get(row.mint) || 0);
    if (delta > 0 && (!best || delta > best.delta)) best = { mint: row.mint, delta };
  }
  return best;
}

function inferMint(tx: ParsedTransactionWithMeta, owner: string): string | null {
  const balances = [...(tx.meta?.postTokenBalances || [])] as any[];
  const owned = balances.find(row => row.owner === owner && row.mint !== WSOL_MINT);
  if (owned?.mint) return owned.mint;
  const anyMint = balances.find(row => row.mint && row.mint !== WSOL_MINT);
  return anyMint?.mint || null;
}

function uiAmount(row: any): number {
  return Number(row.uiTokenAmount?.uiAmount ?? row.uiTokenAmount?.uiAmountString ?? 0);
}

export async function parsePumpEvents(connection: Connection, signature: string, logs: string[]): Promise<PumpEvent[]> {
  const blockTimeMs = Date.now();
  const feeClaim = parseFeeClaimFromLogs(signature, logs, blockTimeMs);
  const txEvents = await parsePumpTransaction(connection, signature, logs);
  return [...(feeClaim ? [feeClaim] : []), ...txEvents];
}
