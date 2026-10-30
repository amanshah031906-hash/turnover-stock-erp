// Signs a tiny "logged in" token using Web Crypto (available as a global in
// both normal Node.js and the Edge runtime Middleware runs in), so the same
// verify logic works in both places without needing separate code paths.
// This is deliberately simple — one flag, one timestamp — since there's
// only ever one account and no roles/permissions to encode.

export const SESSION_COOKIE_NAME = "to_session";

const encoder = new TextEncoder();

function base64url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function getSecret() {
  return process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
}

async function getKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken() {
  const payload = JSON.stringify({ auth: true, iat: Date.now() });
  const payloadB64 = base64url(encoder.encode(payload));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = base64url(new Uint8Array(sig));
  return payloadB64 + "." + sigB64;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payloadB64, sigB64] = token.split(".");
  try {
    const key = await getKey();
    const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const expectedSigB64 = base64url(new Uint8Array(expectedSig));
    if (expectedSigB64 !== sigB64) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
    return !!payload.auth;
  } catch (e) {
    return false;
  }
}