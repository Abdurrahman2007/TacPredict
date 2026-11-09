/** Farcaster Mini App / Frame manifest for https://tacpredict.fun/.well-known/farcaster.json */
export const farcasterManifest = {
  accountAssociation: {
    header:
      "eyJmaWQiOjExNDc3MzQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg3QWEzQ0JGMzRFOTIzMzMyMTllNzhCRTlGRWM2ZmNmNkM2QmZCRTdEIn0",
    payload: "eyJkb21haW4iOiJ0YWNwcmVkaWN0LmZ1biJ9",
    signature:
      "xqAljG4vkeapU2DjkwyqEEedFj6XzKz88b+czWsaE/wS0pPfbtaaVCblN+TsNE+ToeqnuLKVXhvG017ymcylPhw=",
  },
  frame: {
    version: "1",
    name: "TacPredict",
    iconUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
    homeUrl: "https://tacpredict.fun",
    imageUrl: "https://tacpredict.fun/brand/social-logo-v2.png",
    buttonTitle: "Open TacPredict",
    splashImageUrl: "https://tacpredict.fun/brand/app-icon-v2.png",
    splashBackgroundColor: "#0B1220",
    webhookUrl: "https://tacpredict.fun/api/webhook",
  },
} as const;
