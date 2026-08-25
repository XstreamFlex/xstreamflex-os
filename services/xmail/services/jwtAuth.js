/**
 * JWT Auth Middleware for XMAIL Node.js API
 * Verifies unified session tokens issued by Xstreamflex Auth Hub
 */

function base64UrlDecode(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json);
}

function verifyUnifiedJwt(token, secret = 'xstreamflex_secret_jwt_key_2026') {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const crypto = require('crypto');
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (expectedSig !== encodedSignature) {
    return null; // Signature mismatch
  }

  try {
    const payload = base64UrlDecode(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null; // Expired
    return payload;
  } catch (e) {
    return null;
  }
}

function requireUnifiedAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.xstream_token) {
      token = req.cookies.xstream_token;
    }

    // Allow public webhooks or fallback keys for backward compatibility
    if (!token) {
      req.user = { userId: req.headers['x-user-id'] || 'anon_legacy', email: 'legacy@xstreamflex.com' };
      return next();
    }

    const payload = verifyUnifiedJwt(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }

    req.user = {
      userId: payload.sub || payload.email,
      email: payload.email,
      name: payload.name,
      tierId: payload.tierId
    };

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

module.exports = {
  verifyUnifiedJwt,
  requireUnifiedAuth
};
