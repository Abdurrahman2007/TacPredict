import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_MESSAGE_CHARS, MAX_SIGNATURE_CHARS } from "./smart-wallet-policy.mjs";

/**
 * Trades a smart-contract wallet's signed sign-in message for a one-time token the browser turns into a session.
 * No session is needed to call it: the signature is the proof.
 */
export const signInSmartWallet = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        message: z.string().min(20).max(MAX_MESSAGE_CHARS),
        signature: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .max(MAX_SIGNATURE_CHARS),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const hosts: string[] = [];
    try {
      hosts.push(new URL(request.url).host);
    } catch {
      /* the request URL is always present on the Worker; the header below is a second source */
    }
    const header = request.headers.get("host");
    if (header) hosts.push(header);
    const { smartWalletSignIn } = await import("./smart-wallet-auth.server");
    return smartWalletSignIn({ message: data.message, signature: data.signature, hosts });
  });
