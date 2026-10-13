import Link from "next/link";
import { NetworkStatus } from "./NetworkStatus";
import { WalletButton } from "./WalletButton";

type Section = "trade" | "orders" | "history" | "proof";

const LINKS: { key: Section; href: string; label: string }[] = [
  { key: "trade", href: "/", label: "Trade" },
  { key: "orders", href: "/me", label: "My orders" },
  { key: "history", href: "/history", label: "History" },
  { key: "proof", href: "/proof", label: "Proof" },
];

export function TopBar({ active }: { active?: Section }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Batchelor home">
        Batchelor<span className="brand-period">.</span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        {LINKS.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={`nav-link ${active === link.key ? "nav-link--active" : ""}`}
            aria-current={active === link.key ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-actions">
        <NetworkStatus />
        <WalletButton />
      </div>
    </header>
  );
}
