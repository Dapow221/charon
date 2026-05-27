const LAMPORTS_PER_SOL = 1_000_000_000;

export function now(): number {
  return Date.now();
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function short(address: string): string {
  if (!address) return '?';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function fmtSol(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(n >= 10 ? 2 : 3)} SOL` : '? SOL';
}

export function fmtUsd(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '?';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function ageLabel(fromMs: number | null, toMs = now()): string {
  if (!fromMs || !Number.isFinite(fromMs)) return '?';
  const minutes = Math.max(0, Math.floor((toMs - fromMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function gmgnLink(mint: string): string {
  return `https://gmgn.ai/sol/token/${mint}`;
}

export function pumpLink(mint: string): string {
  return `https://pump.fun/${mint}`;
}

export function axiomLink(mint: string): string {
  return `https://axiom.trade/meme/${mint}?chain=sol`;
}

export function txLink(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export function accountLink(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export function discMatch(buf: Buffer, disc: Buffer): boolean {
  return disc.every((byte, index) => buf[index] === byte);
}

export function readPubkey(buf: Buffer, offset: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (const byte of buf.subarray(offset, offset + 32)) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (const byte of buf.subarray(offset, offset + 32)) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits.reverse().map(index => alphabet[index]).join('');
}
