import Link from "next/link";
import { Icon } from "./icons";

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>{action}</div>;
}

export function Tabs({ items, active }: { items: { label: string; href: string }[]; active: string }) {
  return <div className="tabs">{items.map((item) => <Link key={item.label} href={item.href} className={`tab ${active === item.label ? "active" : ""}`} aria-current={active === item.label ? "page" : undefined}>{item.label}</Link>)}</div>;
}

export function Metric({ label, value, note, icon }: { label: string; value: string; note?: string; icon: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={15}/></span></div><div className="metric-value">{value}{note && <span className="metric-note">{note}</span>}</div></div>;
}

export function EmptyState({ title, description, action, className = "" }: { title: string; description: string; action?: React.ReactNode; className?: string }) {
  return <div className={`empty-state ${className}`}>
    <strong>{title}</strong>
    <p>{description}</p>
    {action && <div className="empty-state-action">{action}</div>}
  </div>;
}
