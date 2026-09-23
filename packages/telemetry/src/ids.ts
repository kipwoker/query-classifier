function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newTraceId(): string {
  return randomHex(16); // 128-bit, per OTel spec
}

export function newSpanId(): string {
  return randomHex(8); // 64-bit, per OTel spec
}
