import 'server-only';

import { Address, Hash, PublicKey, Signature } from '@nimiq/core';

/**
 * Proof that a request really comes from the owner of a Nimiq address.
 *
 * The client asks Nimiq Pay to sign a challenge string with `nimiq.sign()`,
 * which returns a public key and a signature. Two things are then checked, and
 * both matter:
 *
 *   1. the signature verifies against the message, and
 *   2. the address derived from that public key is the address being claimed.
 *
 * Checking only the first would let anyone sign with their own key while
 * claiming somebody else's address — which is precisely how you would steal a
 * username or a payout destination.
 *
 * The signed message embeds an intent and a timestamp, so a signature captured
 * for one action cannot be replayed for another or reused indefinitely.
 */
import { signingMessage } from '@/lib/api/message';

const MAX_AGE_MS = 5 * 60 * 1000;

export { signingMessage };

/**
 * Nimiq does not sign the raw bytes of a message.
 *
 * A wallet that signed arbitrary bytes could be tricked into signing something
 * that is also a valid transaction, so Nimiq prefixes the message and hashes
 * the result before signing: SHA-256 over
 *
 *     "\x16Nimiq Signed Message:\n" + <message byte length> + <message bytes>
 *
 * Ed25519 then signs that 32-byte digest. Verification has to reproduce the
 * same construction — checking the raw message instead simply fails, which is
 * what "Signature is invalid" was.
 */
const MSG_PREFIX = '\x16Nimiq Signed Message:\n';

function nimiqSignedMessageHash(message: string): Uint8Array {
  const body = new TextEncoder().encode(message);
  const head = new TextEncoder().encode(`${MSG_PREFIX}${body.length}`);
  const data = new Uint8Array(head.length + body.length);
  data.set(head, 0);
  data.set(body, head.length);
  return Hash.computeSha256(data);
}

export interface SignedRequest {
  address: string;
  publicKey: string;
  signature: string;
  intent: string;
  issuedAt: number;
}

export type AuthResult =
  | { ok: true; address: string }
  | { ok: false; error: string };

export function verifySignedRequest(input: Partial<SignedRequest>, expectedIntent: string): AuthResult {
  const { address, publicKey, signature, intent, issuedAt } = input;

  if (!address || !publicKey || !signature || !intent || typeof issuedAt !== 'number') {
    return { ok: false, error: 'Signature is incomplete.' };
  }
  if (intent !== expectedIntent) {
    return { ok: false, error: 'Signature was issued for a different action.' };
  }
  if (Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) {
    return { ok: false, error: 'Signature has expired. Try again.' };
  }

  try {
    const key = PublicKey.fromHex(publicKey);
    const sig = Signature.fromHex(signature);
    const text = signingMessage(intent, issuedAt);

    // The prefixed hash is what Nimiq Pay produces. The raw form is also
    // accepted because the Mini App provider's `sign()` does not document
    // which of the two it uses, and both commit to exactly the same string —
    // the one carrying this request's intent and timestamp — so accepting
    // either costs nothing: a forger still needs the address's private key.
    const valid =
      key.verify(sig, nimiqSignedMessageHash(text)) ||
      key.verify(sig, new TextEncoder().encode(text));

    if (!valid) return { ok: false, error: 'Signature is not valid.' };

    // The address must be the one this key actually controls.
    const derived = key.toAddress().toUserFriendlyAddress();
    const claimed = Address.fromString(address).toUserFriendlyAddress();
    if (derived !== claimed) return { ok: false, error: 'Signature does not match that address.' };

    return { ok: true, address: derived };
  } catch {
    return { ok: false, error: 'Signature could not be read.' };
  }
}
