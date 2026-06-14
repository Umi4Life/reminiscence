// Admin session tokens are hashed under SESSION_SECRET (see admin-sessions.ts),
// giving them a distinct HMAC key class from access credentials / public
// sessions (TOKEN_HMAC_SECRET) and audit/rate-limit signals
// (RATE_LIMIT_HMAC_SECRET). This domain separation means a leak of one secret
// cannot forge tokens of another class.
export {
  generateOpaqueToken as generateSessionToken,
  hashOpaqueToken as hashSessionToken,
} from "./tokens";
