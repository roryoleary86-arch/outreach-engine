export const SESSION_COOKIE = "oe_session";

/** SHA-256 hex of the app password — used as the session cookie value. */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`outreach-engine:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
