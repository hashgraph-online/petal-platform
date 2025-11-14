import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
};

type MainNavProps = {
  items: NavItem[];
};

export function MainNav({ items }: MainNavProps) {
  return (
    <nav className="hidden gap-6 text-sm font-medium md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-holNavy transition-colors hover:text-holPurple"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
