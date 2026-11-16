import crypto from 'crypto';

// Authenticator app codes (TOTP, RFC 6238: SHA-1, 6 digits, 30 seconds), the
// format Google Authenticator, Microsoft Authenticator, 1Password and Authy read.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

// 160 random bits, written as 32 base32 characters
export const generateTotpSecret = () => {
  const bits = [...crypto.randomBytes(20)]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
};

const base32ToBuffer = (secret: string) => {
  const bits = secret
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};

const codeAt = (key: Buffer, step: number) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 0xf;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
};

// The 30 second step the code belongs to (the one before and after are
// accepted too, for a phone clock that is a little off), or null
export const matchTotpStep = (secret: string, code: string) => {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const key = base32ToBuffer(secret);
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const step of [now - 1, now, now + 1]) {
    if (
      crypto.timingSafeEqual(Buffer.from(codeAt(key, step)), Buffer.from(code))
    ) {
      return step;
    }
  }
  return null;
};

// What the QR code holds, read by the authenticator app
export const totpUri = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    account
  )}?secret=${secret}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
