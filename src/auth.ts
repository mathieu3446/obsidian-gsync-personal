import { requestUrl } from "obsidian";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Full Drive permission discovers files added by users and other applications.
// The synchronization code still traverses only the bound destination.
export const SCOPE = "https://www.googleapis.com/auth/drive";
function validateScope(scope?: string): void {
  if (scope === undefined) return; // omitted scope means the requested scope was granted
  const scopes=scope.split(/\s+/).filter(Boolean);
  if(!scopes.includes(SCOPE)) throw new Error("Full Drive access required. Sign in again to upgrade the previous limited permission.");
  if(scopes.some(s=>s!==SCOPE && s!=="https://www.googleapis.com/auth/drive.file")) throw new Error("Unexpected Google permissions. Use the dedicated GSync OAuth client.");
}
export const DEFAULT_REDIRECT = "https://mathieu3446.github.io/obsidian-gsync-personal/callback.html";
export const PROTOCOL_ACTION = "gsync-personal-auth";
const PENDING_TTL_MS = 15 * 60 * 1000;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** In-memory only, while Google sign-in is pending. */
export interface PendingAuth {
  verifier: string;
  state: string;
  redirectUri: string;
  createdAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formBody(o: Record<string, string>): string {
  return Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export interface PreparedSignIn {
  url: string;
  pending: PendingAuth;
}

/**
 * Builds the Google consent URL ahead of time. Mobile browsers only allow
 * opening a new page synchronously inside a tap, so the async crypto work
 * must be finished before the user taps "Sign in with Google".
 * State contains no vault metadata.
 */
export async function prepareSignIn(clientId: string, redirectUri: string, vaultName: string): Promise<PreparedSignIn> {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.search || redirect.hash) throw new Error("Redirect must be a plain HTTPS URL.");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  const state =
    base64url(crypto.getRandomValues(new Uint8Array(32)));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return {
    url: `${AUTH_URL}?${params.toString()}`,
    pending: { verifier, state, redirectUri, createdAt: Date.now() },
  };
}

export function isPendingValid(p: PendingAuth | null | undefined): p is PendingAuth {
  return !!p && Date.now() >= p.createdAt && Date.now() - p.createdAt < PENDING_TTL_MS;
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  pending: PendingAuth
): Promise<TokenSet> {
  const r = await requestUrl({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: pending.verifier,
      grant_type: "authorization_code",
      redirect_uri: pending.redirectUri,
    }),
    throw: false,
  });
  if (r.status !== 200) throw new Error(`Token exchange failed (${r.status}). Check OAuth configuration.`);
  const j = r.json as TokenResponse;
  validateScope(j.scope);
  if (!j.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and sign in again.");
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000,
  };
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const r = await requestUrl({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    throw: false,
  });
  if (r.status !== 200) {
    if (r.text.includes("invalid_grant")) {
      throw new Error(
        "Google rejected the saved sign-in (invalid_grant). Sign in again. If this happens every ~7 days, publish your OAuth app to 'In production' in Google Cloud."
      );
    }
    if (r.text.includes("invalid_client") || r.text.includes("unauthorized_client")) {
      throw new Error("Google rejected the client ID/secret. If you switched OAuth clients, sign in again with the new one.");
    }
    throw new Error(`Token refresh failed (${r.status}). Sign in again.`);
  }
  const j = r.json as TokenResponse;
  validateScope(j.scope);
  return { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
}

export async function revokeToken(token: string): Promise<void> {
  const r = await requestUrl({ url: "https://oauth2.googleapis.com/revoke", method: "POST",
    contentType: "application/x-www-form-urlencoded", body: formBody({ token }), throw: false });
  if (r.status !== 200) throw new Error(`Google revocation failed (${r.status}). Credentials retained; retry or revoke in your Google account.`);
}
