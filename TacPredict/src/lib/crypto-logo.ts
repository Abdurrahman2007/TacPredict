/**
 * URL of a real token logo shipped in /public/brand/crypto. The version query makes browsers and
 * caches fetch a replaced logo again instead of showing the copy they stored earlier.
 */
export const LOGO_VERSION = "2";
export const cryptoLogoUrl = (key: string) => `/brand/crypto/${key}.svg?v=${LOGO_VERSION}`;
