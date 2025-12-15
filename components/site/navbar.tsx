"use client";

import { useCallback, useState } from "react";
import { FaBars, FaSearch, FaTimes } from "react-icons/fa";
import Link from "next/link";
import dynamic from "next/dynamic";
import Logo from "./logo";
import NavDropdown from "./nav-dropdown";
import NavLink from "./nav-link";
import Search from "./search";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

type NavItem = {
  type: "link" | "dropdown";
  label: string;
  to?: string;
  href?: string;
  items?: Array<{ label: string; to?: string; href?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  {
    type: "dropdown",
    label: "Petals",
    items: [
      { label: "Home", to: "/" },
      { label: "Profile", to: "/profile" },
      { label: "Petal Accounts", to: "/petals" },
      { label: "Messaging", to: "/messages" },
      { label: "Flora Groups", to: "/flora" },
    ],
  },
  { type: "link", label: "Standards", href: "https://hol.org/docs/standards/" },
  {
    type: "dropdown",
    label: "Tools",
    items: [
      {
        label: "Standards SDK",
        href: "https://hol.org/docs/libraries/standards-sdk",
      },
      {
        label: "Conversational Agent",
        href: "https://hol.org/docs/libraries/conversational-agent",
      },
      {
        label: "Standards Agent Kit",
        href: "https://hol.org/docs/standards/hcs-10",
      },
      { label: "Hashnet MCP", href: "https://hol.org/mcp" },
      { label: "Explore All", href: "https://hol.org/tools" },
    ],
  },
  {
    type: "dropdown",
    label: "Events",
    items: [
      { label: "Patchwork", href: "https://hol.org/patchwork" },
      { label: "Africa Hackathon (Ended)", href: "https://hol.org/hackathon" },
      {
        label: "OpenConvAI Hackathon (Ended)",
        href: "https://hol.org/hedera-ai-agents-hackathon",
      },
      { label: "Hedera x AI Demo Day (Ended)", href: "https://hol.org/hederaai" },
    ],
  },
  {
    type: "dropdown",
    label: "Registry",
    items: [
      { label: "Browse Agents", href: "https://hol.org/registry/search" },
      { label: "Register Agent", href: "https://hol.org/registry/register" },
      { label: "API Docs", href: "https://hol.org/registry/docs" },
    ],
  },
  { type: "link", label: "Blog", href: "https://hol.org/blog" },
];

const ThemeToggleButton = dynamic(() => import("./theme-toggle-button"), {
  ssr: false,
});

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>(
    {},
  );

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleMobileSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      closeMobileMenu();
    },
    [closeMobileMenu],
  );

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[50]"
      style={{
        background:
          "linear-gradient(135deg, rgba(85, 153, 254, 0.95) 0%, rgba(63, 65, 116, 0.95) 100%)",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        isolation: "isolate",
      }}
    >
      <div className="px-6">
        <div className="flex items-center justify-between w-full h-[64px] gap-6 flex-nowrap overflow-visible max-md:gap-3 max-[768px]:gap-2">
          <div className="flex items-center gap-6 flex-shrink-0 h-full max-md:gap-3 max-[768px]:gap-2">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-white/90 transition-all duration-200 hover:bg-white/10 focus:outline-none outline-none border-none cursor-pointer bg-transparent"
              aria-label="Toggle mobile menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <FaTimes className="w-5 h-5" />
              ) : (
                <FaBars className="w-5 h-5" />
              )}
            </button>
            <Logo />
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-4 w-px bg-white/30"></div>
              <Link
                href="/"
                className="text-white/90 hover:text-white font-mono text-sm font-medium transition-colors no-underline"
              >
                Petals
              </Link>
            </div>
            <div className="flex items-center gap-3 transition-all duration-300 whitespace-nowrap h-full max-md:hidden">
              {NAV_ITEMS.map((item, index) =>
                item.type === "dropdown" ? (
                  <NavDropdown
                    key={index}
                    label={item.label}
                    items={item.items || []}
                  />
                ) : (
                  <NavLink
                    key={index}
                    to={item.to}
                    href={item.href}
                    label={item.label}
                    external={Boolean(item.href)}
                  />
                ),
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink min-w-0 h-full ml-auto max-md:gap-2">
            <div className="hidden md:flex items-center h-full">
              <Search />
            </div>
            <div className="hidden sm:flex items-center">
              <ConnectWalletButton variant="navbar" />
            </div>
            <ThemeToggleButton />
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="md:hidden"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.2)",
            background: "rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="px-4 py-3 flex flex-col gap-1">
            <form onSubmit={handleMobileSearch} className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  name="search"
                  value={mobileSearchQuery}
                  onChange={(e) => setMobileSearchQuery(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full h-10 pl-4 pr-10 rounded-md bg-white/10 border border-white/20 text-white/95 placeholder:text-white/50 font-mono text-sm focus:outline-none focus:border-white/40 transition-colors"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <FaSearch className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            <div className="mb-3 flex justify-center">
              <ConnectWalletButton onActionComplete={closeMobileMenu} />
            </div>

            {NAV_ITEMS.map((item, index) => {
              if (item.type === "dropdown") {
                const isExpanded = expandedItems[index];
                return (
                  <div key={index}>
                    <button
                      onClick={() => toggleItem(index)}
                      className="w-full text-left px-3 py-1 text-white/50 font-mono text-xs font-semibold uppercase tracking-wider flex items-center gap-1 bg-transparent border-none cursor-pointer hover:text-white/70 transition-colors"
                    >
                      {item.label}
                      <svg
                        className={`w-3 h-3 text-white/50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
                    >
                      {item.items?.map((subItem, subIndex) => {
                        const linkClass =
                          "block px-3 py-2 pl-6 rounded-md text-white/95 font-mono text-[14px] no-underline hover:no-underline transition-all duration-150 hover:bg-white/10 hover:text-white";

                        if (subItem.href) {
                          return (
                            <a
                              key={subIndex}
                              href={subItem.href}
                              className={linkClass}
                              onClick={closeMobileMenu}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {subItem.label}
                            </a>
                          );
                        }
                        return (
                          <Link
                            key={subIndex}
                            href={subItem.to || "/"}
                            className={linkClass}
                            onClick={closeMobileMenu}
                          >
                            {subItem.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const linkClass =
                "block px-3 py-2 rounded-md text-white/95 font-mono text-[14px] no-underline hover:no-underline transition-all duration-150 hover:bg-white/10 hover:text-white";

              if (item.href) {
                return (
                  <a
                    key={index}
                    href={item.href}
                    className={linkClass}
                    onClick={closeMobileMenu}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={index}
                  href={item.to || "/"}
                  className={linkClass}
                  onClick={closeMobileMenu}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
