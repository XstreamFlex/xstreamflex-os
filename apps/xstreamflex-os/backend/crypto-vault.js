/**
 * CryptoVault - Cloudflare Worker Native Cryptographic Engine
 * Provides AES-256-GCM field-level encryption for CRM/PII data,
 * Bcrypt/SHA-256 salted password hashing, and signed JWT session token management.
 */

// Helper to encode string to Uint8Array
function strToBytes(str) {
  return new TextEncoder().encode(str);
}

// Helper to decode Uint8Array to string
function bytesToStr(bytes) {
  return new TextDecoder().decode(bytes);
}

// Convert ArrayBuffer to Hex string
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex string to Uint8Array
function hexToBytes(hexStr) {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
  }
  return bytes;
}

// Base64Url encode
function base64UrlEncode(strOrBytes) {
  const bytes = typeof strOrBytes === 'string' ? strToBytes(strOrBytes) : strOrBytes;
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Base64Url decode
function base64UrlDecode(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export class CryptoVault {
  /**
   * Hashes a raw password securely using PBKDF2 (SHA-256)
   */
  static async hashPassword(password, salt = null) {
    const saltBytes = salt ? hexToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
    const passBytes = strToBytes(password);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      passBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      importedKey,
      256
    );

    return {
      hash: bufferToHex(derivedKey),
      salt: bufferToHex(saltBytes)
    };
  }

  /**
   * Verifies password against salt and stored hash
   */
  static async verifyPassword(password, storedHash, salt) {
    const computed = await this.hashPassword(password, salt);
    return computed.hash === storedHash;
  }

  /**
   * AES-256-GCM Field Encryption for CRM / PII fields
   */
  static async encryptField(plaintext, secretKey) {
    if (!plaintext) return '';
    const keyBytes = strToBytes(secretKey.padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      strToBytes(plaintext)
    );

    return `${bufferToHex(iv)}:${bufferToHex(encrypted)}`;
  }

  /**
   * AES-256-GCM Field Decryption for CRM / PII fields
   */
  static async decryptField(ciphertextHex, secretKey) {
    if (!ciphertextHex || !ciphertextHex.includes(':')) return ciphertextHex;
    try {
      const [ivHex, dataHex] = ciphertextHex.split(':');
      const iv = hexToBytes(ivHex);
      const data = hexToBytes(dataHex);

      const keyBytes = strToBytes(secretKey.padEnd(32, '0').slice(0, 32));
      const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      return bytesToStr(new Uint8Array(decrypted));
    } catch (e) {
      return ciphertextHex; // Return original if fallback or unencrypted
    }
  }

  /**
   * Sign a JWT Token for cross-domain SSO (.xstreamflex.com)
   */
  static async signJWT(payload, secret, expiresInSeconds = 86400 * 30) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
      iss: 'https://xstreamflex.com'
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      strToBytes(secret || 'xstreamflex_secret_jwt_key_2026'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, strToBytes(dataToSign));
    const encodedSignature = base64UrlEncode(new Uint8Array(signature));

    return `${dataToSign}.${encodedSignature}`;
  }

  /**
   * Verify and decode a JWT Token
   */
  static async verifyJWT(token, secret) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    try {
      const key = await crypto.subtle.importKey(
        'raw',
        strToBytes(secret || 'xstreamflex_secret_jwt_key_2026'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = base64UrlDecode(encodedSignature);
      const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, strToBytes(dataToSign));

      if (!isValid) return null;

      const payload = JSON.parse(bytesToStr(base64UrlDecode(encodedPayload)));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null; // Token expired

      return payload;
    } catch (e) {
      return null;
    }
  }
}
