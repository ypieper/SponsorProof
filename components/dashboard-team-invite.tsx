"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

type TeamMembersResponse = { members?: { user_id: string }[] };

export function DashboardTeamInvite() {
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/team/members", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as TeamMembersResponse;
      })
      .then((data) => {
        if (active) setShowInvite(data?.members?.length === 1);
      })
      .catch(() => {
        if (active) setShowInvite(false);
      });

    return () => { active = false; };
  }, []);

  if (!showInvite) return null;

  return <section className="panel dashboard-team-invite">
    <span className="metric-icon"><Icon name="users" size={17}/></span>
    <div><strong>Gemeinsam im Veranstalterbereich arbeiten</strong><p>Füge weitere Benutzer hinzu, damit ihr Events und Sponsoren gemeinsam verwalten könnt.</p></div>
    <Link className="btn dashboard-team-invite-link" href="/einstellungen?tab=team">Zum Team-Bereich <Icon name="arrow" size={14}/></Link>
  </section>;
}
