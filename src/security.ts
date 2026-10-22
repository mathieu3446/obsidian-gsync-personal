export interface Sealed { version: 1; salt: string; iv: string; ciphertext: string }
const enc = new TextEncoder();
const iterations = 600000;
function b64(data: Uint8Array): string {
  let s = ""; for (const b of data) s += String.fromCharCode(b); return btoa(s);
}
function bytes(s: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function key(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, raw,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function seal(value: unknown, password: string): Promise<Sealed> {
  if (password.length < 14) throw new Error("Use a passphrase of at least 14 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("gsync-personal:v1") },
    await key(password, salt), enc.encode(JSON.stringify(value)));
  return { version: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) };
}
export async function unseal(value: Sealed, password: string): Promise<unknown> {
  if (value.version !== 1 || bytes(value.salt).length !== 16 || bytes(value.iv).length !== 12 || value.ciphertext.length > 100000) throw new Error("Invalid encrypted credentials.");
  try {
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(value.iv), additionalData: enc.encode("gsync-personal:v1") },
      await key(password, bytes(value.salt)), bytes(value.ciphertext));
    return JSON.parse(new TextDecoder().decode(clear));
  } catch { throw new Error("Wrong passphrase or damaged credentials."); }
}
export async function hash(data: ArrayBuffer): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}
export function safeSegment(name: string): boolean {
  return !!name && name.length <= 200 && !/[\\/\x00-\x1f<>:"|?*]/.test(name) &&
    !name.startsWith(".") && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) &&
    !["__proto__", "constructor", "prototype"].includes(name);
}
export function safePath(path: string, configDir: string): boolean {
  return path.length < 1000 && path.split("/").every(safeSegment) &&
    path.toLowerCase() !== configDir.toLowerCase() && !path.toLowerCase().startsWith(configDir.toLowerCase() + "/");
}
export function uniqueSuffix(): string { return crypto.randomUUID(); }
