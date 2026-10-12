// Only server-issued Web3 identities prove the signed-in wallet. Never use user_metadata.
export function sessionMatchesWallet(session, address, nowSeconds = Date.now() / 1000) {
  if (
    !/^0x[0-9a-f]{40}$/i.test(address ?? "") ||
    !session?.user ||
    !Number.isFinite(session.expires_at) ||
    session.expires_at <= nowSeconds
  )
    return false;
  const key = address.toLowerCase();
  return (session.user.identities ?? []).some((identity) => {
    if (!["ethereum", "web3"].includes(identity.provider)) return false;
    const data = identity.identity_data ?? {};
    return [data.address, data.sub].some(
      (v) =>
        typeof v === "string" &&
        (v.toLowerCase() === key ||
          (/^eip155:\d+:0x[0-9a-f]{40}$/i.test(v) && v.split(":")[2].toLowerCase() === key)),
    );
  });
}
