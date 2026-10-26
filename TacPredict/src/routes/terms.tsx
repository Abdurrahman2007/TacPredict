import { createFileRoute, Link } from "@tanstack/react-router";
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
      "TacPredict provides prediction-market interfaces and information relating to cryptocurrency price movements (BTC, ETH, SOL, XRP and BNB) and football and cricket outcomes. The Virtual USDC feature uses internal, nontransferable accounting units, not real USDC, money, a redeemable token or a claim on treasury assets.",
      "Virtual balances and virtual trading profits cannot be deposited, withdrawn, transferred, bridged or converted into real assets. No starting-balance campaign, reward allocation or future TAC token is promised. Reference charts and scheduled windows do not establish that any market or trading feature is enabled.",
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
      "You may lose all Virtual USDC committed to a market; this is a loss of virtual accounting units, not a cash balance. Virtual liquidity is finite and a position may not be sellable when you want. Virtual performance is not evidence of achievable real-world returns.",
      "Data sources, networks, wallets and smart contracts may fail, be delayed or contain errors. Native ETH network fees are real expenses and are not refundable by the virtual accounting system. Only spend network fees you can afford to lose.",
    ],
  },
  {
    title: "Virtual Balances and Network Fees",
    paragraphs: [
      "Do not send real USDC or any other asset to obtain a Virtual USDC balance. Virtual grants, if separately authorized in the future, have their own eligibility and finite budget; no user can demand a grant or redemption.",
      "Each Buy and Sell requires its own successful blockchain transaction and verified event. A signature, pending transaction hash or interface notification alone is not a completed trade. Review network, contract, outcome, virtual amount and gas before confirming. A virtual fee is not a real-USDC charge. Liquidity, execution price and uninterrupted access are not guaranteed.",
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
    title: "Privacy and Public Blockchain Records",
    paragraphs: [
      "Wallet addresses, transaction amounts, approvals and other onchain activity may be publicly visible and permanently recorded. A wallet address is not a guarantee of anonymity. Do not include personal or sensitive information in public transaction fields.",
      "Connecting a wallet, requesting support or using optional account features may involve personal information. Provide only information reasonably needed for the relevant request and review any privacy notices presented when information is collected. These Terms are not a substitute for a privacy notice and do not waive your rights under applicable data-protection law.",
      "Third-party wallets, analytics, infrastructure and linked services may handle data under their own policies. Blockchain records may not be alterable or erasable even if access to the interface or an account is discontinued.",
    ],
  },
  {
    title: "Platform Content and Intellectual Property",
    paragraphs: [
      "The TacPredict name, branding, interface and other Platform content may be protected by intellectual-property rights. Using the Platform does not transfer ownership of those rights. Subject to these Terms and applicable law, you may access the interface for its intended purposes.",
      "Do not impersonate the Platform, misrepresent an affiliation or reproduce its branding in a misleading way. Third-party names, team logos, token symbols and data remain the property of their respective owners; their display does not imply sponsorship or endorsement.",
      "Nothing in these Terms restricts rights expressly granted by an applicable open-source licence or other rights that cannot lawfully be restricted.",
    ],
  },
  {
    title: "Errors, Failed Transactions and Unsupported Transfers",
    paragraphs: [
      "Before signing, verify the network, asset, destination, contract, outcome, amount and allowance. Sending unsupported assets or using an incorrect network or address can cause permanent loss. Recovery is not guaranteed.",
      "A pending, rejected or failed transaction is not a confirmed prediction. Confirm status using the relevant transaction receipt and market records. Repeated submissions may create separate transactions and additional fees. A displayed estimate, chart or notification is not proof of execution or settlement.",
      "Report apparent interface errors to support@tacpredict.fun with a public transaction hash and a description. Never send credentials or recovery phrases. Reporting an error does not itself cancel a transaction, establish an entitlement to reimbursement or extend a market deadline.",
    ],
  },
  {
    title: "Complaints and Security Reports",
    paragraphs: [
      "For a complaint, include the relevant market identifier, public wallet address or transaction hash, the issue and the remedy requested. Send only information you are comfortable sharing through email. We may request additional non-secret information reasonably necessary to investigate.",
      "Suspected phishing, unauthorized access or a vulnerability can be reported to support@tacpredict.fun. Do not exploit an issue, access other users’ information or disrupt services while investigating it. No reward or bug-bounty payment is promised unless expressly stated in a separate programme.",
      "A support inquiry is not a substitute for any formal market dispute process. Follow the applicable market rules and deadlines. Support cannot guarantee an outcome or reverse an independently confirmed blockchain transaction. Nothing prevents a complaint to a competent regulator or exercise of legal rights.",
    ],
  },
  {
    title: "Electronic Communications and Notices",
    paragraphs: [
      "Platform information and updates may be provided through the interface or contact channels you choose to use. Check the relevant market rules and published notices before participating. Official social channels are informational and do not override these Terms, market rules or confirmed blockchain records.",
      "Do not rely on unsolicited messages claiming guaranteed returns, special wallet access or urgent transfers. Support will not need your private key or recovery phrase. These Terms do not authorize unsolicited marketing or replace any consent required by applicable law.",
    ],
  },
  {
    title: "Responsible Participation",
    paragraphs: [
      "Set your own activity and gas-spending limits. Do not spend borrowed money or essential funds on network fees. Stop if participation causes stress or loss of control. No chart, virtual profit, ranking or promotional material guarantees a real-world reward.",
      "You may stop using the interface at any time. This does not automatically close positions, cancel pending transactions or revoke wallet approvals; any outstanding activity remains subject to applicable contracts and market rules. If you need help restricting interface access, contact support without sharing wallet secrets.",
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
        Back to TacPredict
      </Link>
      <header>
        <h1 id="terms-title">Terms of Service</h1>
        <p className="terms-description">Terms of Service for the TacPredict prediction platform</p>
        <p className="terms-platform">TacPredict.fun</p>
        <p className="terms-updated">
          Last updated: <time dateTime="2026-10-24">October 24, 2026</time>
        </p>
      </header>
      <aside className="terms-notice" aria-labelledby="restricted-notice-title">
        <h2 id="restricted-notice-title">Restricted Territory Notice</h2>
        <p>
          The Platform is not available in restricted jurisdictions. If you are a restricted person,
          do not use or attempt to access the Platform. Using a VPN or other tools to bypass these
          restrictions is prohibited.
        </p>
        <p>
          You must be at least 18 years old, or the age of majority in your jurisdiction if higher.
          Participation involves financial risk: you may lose all funds you commit.
        </p>
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
