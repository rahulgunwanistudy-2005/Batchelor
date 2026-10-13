import Link from "next/link";
import { Activity, BookOpen, Layers3, Settings2, ShieldCheck } from "lucide-react";
import { NetworkStatus } from "./NetworkStatus";
import { WalletButton } from "./WalletButton";

export function TopBar({ active }: { active?: "trade" | "orders" | "proof" }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Batchelor home">
        <span className="brand-mark"><Layers3 size={19} strokeWidth={2.2} /></span>
        <span>batchelor<span className="brand-period">.</span></span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/" className={`nav-link ${active === "trade" ? "nav-link--active" : ""}`} aria-current={active === "trade" ? "page" : undefined}><Activity size={15} /> Trade</Link>
        <Link href="/me" className={`nav-link ${active === "orders" ? "nav-link--active" : ""}`} aria-current={active === "orders" ? "page" : undefined}><BookOpen size={15} /> My orders</Link>
        <Link href="/#history" className="nav-link">Auction history</Link>
        <Link href="/proof" className={`nav-link ${active === "proof" ? "nav-link--active" : ""}`} aria-current={active === "proof" ? "page" : undefined}><ShieldCheck size={15} /> Proof</Link>
      </nav>
      <div className="topbar-actions">
        <NetworkStatus />
        <WalletButton />
        <button className="icon-button" type="button" aria-label="Settings" disabled><Settings2 size={17} /></button>
      </div>
    </header>
  );
}
