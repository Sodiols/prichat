// Hashes text with SHA-256 using the browser's built-in Web Crypto API.
// Used so room passcodes are never stored or compared in plain text.
export async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
