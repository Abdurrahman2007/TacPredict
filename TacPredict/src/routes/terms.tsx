import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import "@/styles/terms.css";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — TacPredict" },
      {
        name: "description",
        content: "TacPredict terms, eligibility, risks, market rules and support contact.",
      },
    ],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "Acceptance of Terms",
    paragraphs: [
      "By accessing or using TacPredict.fun (the “Platform”), you agree to these Terms of Service. If you do not agree, do not use the Platform. These Terms apply only to the extent permitted by applicable law.",
    ],
  },
  {
    title: "Nature of the Service",
    paragraphs: [
      "TacPredict provides prediction-market interfaces and information relating to future events, including cryptocurrency price movements (BTC, ETH, SOL and BNB) and football and cricket outcomes. Where enabled and legally available, eligible users may participate using supported stablecoins such as USDC.",
      "Reference prices, preview listings and scheduled time windows are not necessarily tradable markets. A countdown or a live price chart does not mean real-money trading is available. Availability depends on the relevant market, supported contracts and applicable restrictions.",
      "The Platform does not provide financial, investment or legal advice. The legal classification of prediction-market activities depends on applicable law; these Terms do not establish that the Platform is licensed, exempt from licensing, or lawful in any particular jurisdiction.",
    ],
  },
  {
    title: "Eligibility",
    paragraphs: [
      "You must be at least 18 years old or the age of majority in your jurisdiction, whichever is higher. You must have legal capacity to accept these Terms and must not use the Platform where participation is prohibited.",
      "You are responsible for checking whether your participation is lawful. The Platform may require eligibility, identity or location checks where applicable.",
    ],
  },
  {
    title: "Restricted Jurisdictions",
    paragraphs: [
      "The Platform is not available to persons located in, resident in, or accessing it from Bangladesh, India, Pakistan, Nepal, the United States, the United Kingdom, France, Singapore or China, or any jurisdiction subject to applicable comprehensive sanctions. This list is not exhaustive and may change.",
      "Do not use a VPN, proxy, false information or another method to bypass restrictions. Technical access does not mean you are eligible or legally permitted to participate. Use in violation of restrictions may result in access being suspended.",
    ],
  },
  {
    title: "Risk Disclosure",
    paragraphs: [
      "You may lose 100% of the funds you commit to a market. Cryptocurrency and prediction markets are volatile. Liquidity may be limited, and a position may not be sellable when you want.",
      "External data sources, oracles, networks and smart contracts may fail, be delayed, contain errors or be affected by security incidents. A stablecoin may lose its intended value. Past performance does not guarantee future results. Only use funds you can afford to lose.",
    ],
  },
  {
    title: "Real-Money Transactions and Fees",
    paragraphs: [
      "Only supported assets and networks may be used where trading is enabled. USDC and other stablecoins are digital assets, not bank deposits or a guarantee of redemption into US Dollars.",
      "Review the market, outcome, amount, wallet permissions and any network or Platform fees before confirming. Confirmed blockchain transactions are generally irreversible; cancellations or refunds are not guaranteed. The Platform does not guarantee liquidity, execution price, uninterrupted access or the availability of any market.",
      "You are responsible for applicable taxes and reporting obligations. Network fees may be incurred even when a transaction fails.",
    ],
  },
  {
    title: "Wallet Security",
    paragraphs: [
      "You control your self-custody wallet and are responsible for safeguarding its recovery phrase, private keys and signing permissions. Never send a recovery phrase or private key to support. Verify the site address and transaction details before signing.",
      "The Platform cannot recover lost private keys or reverse blockchain transactions. Disconnecting a wallet does not automatically revoke existing onchain approvals.",
    ],
  },
  {
    title: "Market Rules, Timing and Settlement",
    paragraphs: [
      "Read the specific market rules before participating. Those rules identify the event, deadlines, outcome criteria and settlement source. Market-specific rules govern the outcome of that market if they differ from general descriptive text.",
      "Displayed time windows and charts are informational. A scheduled window is not evidence that a market was created, traded or settled. Reference spot prices are not prediction odds and may differ from the designated settlement source.",
      "Settlement may be delayed or subject to a dispute, cancellation or other process specified by the market rules and applicable contracts. There is no promise of an immediate payout.",
    ],
  },
  {
    title: "Prohibited Activities",
    paragraphs: [
      "Do not engage in market manipulation, wash trading, coordinated abusive trading, fraud, money laundering, sanctions evasion or any other unlawful activity.",
      "Do not create or use multiple accounts to evade restrictions, gain improper rewards or manipulate markets. Do not bypass geographical restrictions or interfere with eligibility checks.",
      "Do not attack the Platform, exploit vulnerabilities, access other users’ data or attempt unauthorized access. Nothing in these Terms limits rights to interoperability, security research or other conduct that applicable law does not permit us to restrict.",
    ],
  },
  {
    title: "Service Availability and Third Parties",
    paragraphs: [
      "The Platform may depend on third-party wallets, infrastructure, data providers and blockchain networks. Their services may have separate terms. We do not guarantee the accuracy or availability of third-party services.",
      "Features may be changed, paused or discontinued for maintenance, security, legal or operational reasons. Links to third parties are not an endorsement.",
    ],
  },
  {
    title: "Limitation of Liability",
    paragraphs: [
      "The Platform is provided on an “as is” and “as available” basis. To the extent permitted by applicable law, TacPredict and its operators disclaim warranties and are not liable for losses arising from use of the Platform, including loss of funds, profits or data.",
      "To the extent permitted by applicable law, total liability for a claim is limited to the Platform fees, if any, you paid in the 30 days before the event giving rise to the claim. This does not exclude or limit liability that cannot lawfully be excluded or limited, including any mandatory consumer rights.",
    ],
  },
  {
    title: "Suspension and Termination",
    paragraphs: [
      "Access may be restricted, suspended or terminated for violations of these Terms, suspected abuse, security concerns or legal and regulatory requirements, with notice where required by law.",
      "Restricting the interface does not by itself reverse transactions or change the operation of independently deployed smart contracts. Any remaining positions are subject to the applicable market rules and contracts.",
    ],
  },
  {
    title: "Applicable Law and Disputes",
    paragraphs: [
      "These Terms do not override applicable mandatory laws or any non-waivable consumer rights. No particular governing jurisdiction, exclusive court or mandatory arbitration provider is designated in these Terms.",
      "For a dispute, first contact support@tacpredict.fun with relevant non-sensitive details so that we can try to resolve it. This does not prevent you from exercising any legal rights or contacting an appropriate regulator or court.",
    ],
  },
  {
    title: "Changes to These Terms",
    paragraphs: [
      "We may update these Terms. The version published on this page will show its last-updated date. Material changes will be notified where required by law. Continued use after an update constitutes acceptance only to the extent permitted by applicable law.",
    ],
  },
  {
    title: "General Provisions",
    paragraphs: [
      "If a provision is found unenforceable, the remaining provisions continue to apply to the extent permitted by law. Failure to enforce a provision does not waive the right to enforce it later.",
      "These Terms and the applicable market rules govern use of the Platform. Nothing in them guarantees profits or creates a fiduciary, advisory or employment relationship.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "For questions about these Terms or the Platform, email support@tacpredict.fun. Do not include passwords, private keys, recovery phrases or other sensitive credentials.",
    ],
  },
];

function TermsPage() {
  return (
    <article className="tp-terms" aria-labelledby="terms-title">
      <Link to="/" className="terms-back">
        <ArrowLeft size={16} aria-hidden="true" /> Back home
      </Link>
      <header>
        <p className="terms-eyebrow">TacPredict.fun</p>
        <h1 id="terms-title">Terms of Service</h1>
        <p className="terms-updated">
          Last updated: <time dateTime="2026-10-22">October 22, 2026</time>
        </p>
      </header>
      <aside className="terms-risk" aria-label="Risk notice">
        Participation involves financial risk. You may lose all funds you commit. Available only to
        eligible users where permitted by law.
      </aside>
      {sections.map((section, index) => (
        <section key={section.title} aria-labelledby={`terms-section-${index + 1}`}>
          <h2 id={`terms-section-${index + 1}`}>
            {index + 1}. {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>
              {paragraph.split("support@tacpredict.fun").map((part, i) => (
                <span key={i}>
                  {i > 0 && <a href="mailto:support@tacpredict.fun">support@tacpredict.fun</a>}
                  {part}
                </span>
              ))}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
