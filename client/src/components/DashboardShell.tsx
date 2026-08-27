import { useMemo, useState } from "react";
import { Bot, CheckCircle2, CircuitBoard, FileText, Home, Menu, Package, Search, Settings, X, Zap } from "lucide-react";
import { Link, useLocation } from "wouter";
import ThemeToggle from "@/components/ThemeToggle";
import type { KeyboardEvent, ReactNode } from "react";

const navItems = [
  { href: "/", label: "Home", icon: Home, match: (path: string) => path === "/" },
  { href: "/lab", label: "Boolean Lab", icon: Zap, match: (path: string) => path.startsWith("/lab") },
  { href: "/problem", label: "Problem Solver", icon: FileText, match: (path: string) => path.startsWith("/problem") },
  { href: "/modules", label: "Modules", icon: Package, match: (path: string) => path.startsWith("/modules") },
  { href: "/verify", label: "Verification", icon: CheckCircle2, match: (path: string) => path.startsWith("/verify") },
  { href: "/settings", label: "Settings", icon: Settings, match: (path: string) => path.startsWith("/settings") },
];

const searchItems = [
  { label: "Home", description: "Overview of the Boolean Circuit Lab", href: "/", keywords: "dashboard overview" },
  { label: "Boolean Lab", description: "Analyze and minimize Boolean functions", href: "/lab", keywords: "boolean expression terms truth table dont care minimization" },
  { label: "K-Map", description: "Edit and inspect Karnaugh-map cells", href: "/lab?tab=kmap", keywords: "karnaugh map grouping" },
  { label: "Gate Circuits", description: "Inspect standard, NAND-only, and NOR-only realizations", href: "/lab?tab=gates", keywords: "and or not nand nor gates circuit" },
  { label: "Transform", description: "Compare source, SOP, POS, and equivalent gates", href: "/lab?tab=transform", keywords: "sop pos transformation" },
  { label: "Verification", description: "Run exhaustive equivalence checks", href: "/verify", keywords: "proof verify equivalence" },
  { label: "Problem Solver", description: "Write or upload a digital-circuit problem", href: "/problem", keywords: "solver upload pdf image latex" },
  { label: "Modules", description: "Open interactive arithmetic circuits", href: "/modules", keywords: "adder subtractor multiplier arithmetic" },
  { label: "Half Adder", description: "XOR sum and AND carry", href: "/modules#half-adder", keywords: "sum carry xor and" },
  { label: "Full Adder", description: "Two half adders and carry merge", href: "/modules#full-adder", keywords: "sum carry cin" },
  { label: "Ripple-Carry Adder", description: "Configurable multi-bit addition", href: "/modules#ripple-adder", keywords: "ripple full adder bits" },
  { label: "Half Subtractor", description: "XOR difference and borrow", href: "/modules#half-subtractor", keywords: "difference borrow" },
  { label: "Full Subtractor", description: "Two-XOR difference and borrow merge", href: "/modules#full-subtractor", keywords: "difference bin bout" },
  { label: "Two’s Complement Subtractor", description: "A + ~B + 1 subtraction", href: "/modules#twos-complement-subtractor", keywords: "twos complement no borrow" },
  { label: "2-bit Multiplier", description: "Partial products and half-adder cascade", href: "/modules#multiplier-2bit", keywords: "multiply product partial" },
  { label: "3-bit Multiplier", description: "Diagonal partial-product reduction array", href: "/modules#multiplier-3bit", keywords: "multiply product matrix diagonal" },
  { label: "Settings", description: "Theme and lab preferences", href: "/settings", keywords: "preferences dark light" },
];

function Brand() {
  return <Link className="dashboard-brand" href="/" aria-label="Boolean Circuit Lab home"><svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect className="brand-mark-bg" x="1" y="1" width="38" height="38" rx="10" /><path className="brand-mark-trace" d="M7 12h9M7 20h9M7 28h9M16 12v16M16 20h7" /><circle className="brand-mark-node" cx="16" cy="20" r="2.2" /><path className="brand-mark-gate" d="M23 14h2.5a6 6 0 0 1 0 12H23z" /><path className="brand-mark-trace" d="M28 20h5" /><circle className="brand-mark-node" cx="33" cy="20" r="1.8" /></svg><span><b>BOOLEAN</b><em>CIRCUIT LAB</em></span></Link>;
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const openAssistant = () => window.dispatchEvent(new CustomEvent("open-logic-assistant"));
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return searchItems.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(query)).slice(0, 8);
  }, [searchQuery]);
  const selectSearchResult = (href: string) => {
    navigate(href);
    setSearchQuery("");
    setSearchOpen(false);
    setActiveSearchIndex(0);
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((index) => Math.min(index + 1, searchResults.length - 1));
    }
    if (event.key === "ArrowUp" && searchResults.length) {
      event.preventDefault();
      setActiveSearchIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && searchResults.length) {
      event.preventDefault();
      selectSearchResult(searchResults[activeSearchIndex]?.href ?? searchResults[0].href);
    }
  };

  return <div className="dashboard-shell">
    <header className="dashboard-topbar">
      <div className="dashboard-topbar-left"><button type="button" className="dashboard-menu-button" aria-label="Open navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu size={21} /></button><Brand /></div>
      <div className="dashboard-search-wrap">
        <label className="dashboard-search"><Search size={16} /><input aria-label="Search Boolean Circuit Lab" placeholder="Search tools, modules, signals…" value={searchQuery} onFocus={() => searchQuery.trim() && setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(Boolean(event.target.value.trim())); setActiveSearchIndex(0); }} onKeyDown={handleSearchKeyDown} /></label>
        {searchOpen && searchQuery.trim() && <div className="dashboard-search-results" role="listbox" aria-label="Search results">{searchResults.length ? searchResults.map((item, index) => <button type="button" role="option" aria-selected={index === activeSearchIndex} className={index === activeSearchIndex ? "is-active" : ""} key={item.href} onMouseDown={(event) => { event.preventDefault(); selectSearchResult(item.href); }}><Search size={14} /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>) : <div className="dashboard-search-empty">No matching tools or modules</div>}</div>}
      </div>
      <div className="dashboard-topbar-actions"><button type="button" className="dashboard-ai-button" onClick={openAssistant}><Bot size={16} /><span>Ask AI</span></button><ThemeToggle /></div>
    </header>
    <aside className={`dashboard-sidebar ${drawerOpen ? "is-open" : ""}`} aria-label="Primary navigation">
      <div className="dashboard-sidebar-heading"><span>WORKBENCH</span><button type="button" className="dashboard-drawer-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X size={18} /></button></div>
      <nav className="dashboard-nav">{navItems.map(({ href, label, icon: Icon, match }) => <Link key={href} href={href} className={match(location) ? "is-active" : ""} onClick={() => setDrawerOpen(false)}><Icon size={17} /><span>{label}</span>{match(location) && <i />}</Link>)}</nav>
      <div className="dashboard-sidebar-note"><CircuitBoard size={17} /><div><strong>Signal Atlas</strong><span>Analyze, synthesize, verify.</span></div></div>
    </aside>
    {drawerOpen && <button type="button" className="dashboard-overlay" aria-label="Close navigation overlay" onClick={() => setDrawerOpen(false)} />}
    <main className="dashboard-content">{children}</main>
  </div>;
}
