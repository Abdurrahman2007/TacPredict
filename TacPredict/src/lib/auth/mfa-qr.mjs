/** SDK versions return either raw SVG or an SVG data URI. Never double-wrap it. */
export function authenticatorQrSource(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Authenticator QR unavailable');
  const input = value.trim();
  if (/^data:image\/svg\+xml;base64,/i.test(input)) return input;
  let svg = input;
  if (/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(input)) {
    svg = input.slice(input.indexOf(',') + 1);
    if (!svg.trimStart().startsWith('<')) svg = decodeURIComponent(svg);
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw Error('Invalid authenticator QR');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
