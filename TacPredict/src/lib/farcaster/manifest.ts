/** Shared Mini App / Frame config for Farcaster + Base clients. */
const app = {
  version: "1",
  name: "TacPredict",
  subtitle: "Virtual Prediction Market",
  description:
    "Predict crypto, sports, politics, and culture outcomes in real time. Trade YES or NO shares, climb the leaderboard, and track your prediction portfolio.",
  tagline: "Predict Outcomes. Win Big.",
  homeUrl: "https://tacpredict.fun",
  canonicalDomain: "tacpredict.fun",
  iconUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
  imageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
  heroImageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
  splashImageUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
  splashBackgroundColor: "#0B1220",
  buttonTitle: "Open TacPredict",
  webhookUrl: "https://tacpredict.fun/api/webhook",
  primaryCategory: "finance",
  tags: ["prediction", "markets", "forecasting", "crypto", "trading"],
  screenshotUrls: [
    "https://tacpredict.fun/brand/screenshot-markets.png",
    "https://tacpredict.fun/brand/screenshot-portfolio.png",
    "https://tacpredict.fun/brand/screenshot-leaderboard.png",
  ],
  ogTitle: "TacPredict Market",
  ogDescription:
    "Trade YES/NO shares on real-world events on TacPredict virtual prediction market.",
  ogImageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
  castShareUrl: "https://tacpredict.fun",
  noindex: false,
  supportsFullScreen: true,
} as const;

/**
 * Farcaster Mini App / Frame manifest for https://tacpredict.fun/.well-known/farcaster.json
 * accountAssociation must stay byte-identical to the signed domain payload.
 */
export const farcasterManifest = {
  accountAssociation: {
    header:
      "eyJmaWQiOjExNDc3MzQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg3QWEzQ0JGMzRFOTIzMzMyMTllNzhCRTlGRWM2ZmNmNkM2QmZCRTdEIn0",
    payload: "eyJkb21haW4iOiJ0YWNwcmVkaWN0LmZ1biJ9",
    signature:
      "xqAljG4vkeapU2DjkwyqEEedFj6XzKz88b+czWsaE/wS0pPfbtaaVCblN+TsNE+ToeqnuLKVXhvG017ymcylPhw=",
  },
  miniapp: app,
  frame: app,
} as const;

/** Embed tool meta payload (`fc:miniapp`). */
export const farcasterMiniAppEmbed = {
  version: "1",
  imageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
  button: {
    title: "Open TacPredict",
    action: {
      type: "launch_miniapp",
      name: "TacPredict",
      url: "https://tacpredict.fun",
      splashImageUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
      splashBackgroundColor: "#0B1220",
    },
  },
} as const;

/** Legacy embed meta payload (`fc:frame`). */
export const farcasterFrameEmbed = {
  version: "1",
  imageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
  button: {
    title: "Open TacPredict",
    action: {
      type: "launch_frame",
      name: "TacPredict",
      url: "https://tacpredict.fun",
      splashImageUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
      splashBackgroundColor: "#0B1220",
    },
  },
} as const;
