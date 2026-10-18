import type { ReactNode } from "react";

type SponsorGroupProps = {
  name: string;
  itemCount: number;
  itemLabel: string;
  itemLabelPlural?: string;
  children: ReactNode;
  headerAside?: ReactNode;
  contentClassName?: string;
  className?: string;
};

export function SponsorGroup({ name, itemCount, itemLabel, itemLabelPlural, children, headerAside, contentClassName = "event-benefit-cards", className = "" }: SponsorGroupProps) {
  return <section className={`event-benefit-sponsor-group ${className}`.trim()}>
    <header>
      <div><h3>{name}</h3><span>{itemCount} {itemCount === 1 ? itemLabel : itemLabelPlural ?? itemLabel}</span></div>
      {headerAside}
    </header>
    <div className={contentClassName}>{children}</div>
  </section>;
}
