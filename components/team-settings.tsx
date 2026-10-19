"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Member = { user_id: string; email: string; full_name: string; role: "owner" | "member"; joined_at: string };
export function TeamSettings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeExpiresAt, setJoinCodeExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [memberActionId, setMemberActionId] = useState("");
  const [message, setMessage] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const loadTeam = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const teamResponse = await fetch("/api/team/members", { cache: "no-store" });
      const teamData = await teamResponse.json();
      if (!teamResponse.ok) throw new Error(teamData.error ?? "team");
      const teamMembers = (teamData.members ?? []) as Member[];
      const owner = teamMembers.some((member) => member.user_id === teamData.currentUserId && member.role === "owner");
      setMembers(teamMembers);
      setCurrentUserId(String(teamData.currentUserId ?? ""));
      setIsOwner(owner);
      setTeamLoaded(true);
      if (owner) {
        const supabase = createClient();
        const { data: joinCodeData, error: joinCodeError } = await supabase.rpc("get_organization_join_code");
        if (joinCodeError || !joinCodeData || typeof joinCodeData.code !== "string" || typeof joinCodeData.expires_at !== "string") throw joinCodeError ?? new Error("join-code");
        setJoinCode(joinCodeData.code);
        setJoinCodeExpiresAt(joinCodeData.expires_at);
      } else {
        setJoinCode("");
        setJoinCodeExpiresAt("");
      }
    } catch {
      setMessage("Der gemeinsame Veranstalterbereich konnte nicht geladen werden. Bitte prüfe, ob die Datenbankmigration bereits ausgeführt wurde.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  async function copyJoinCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setMessage("Beitrittscode kopiert. Teile ihn mit der neuen Person.");
    } catch {
      setMessage("Markiere den Code und kopiere ihn zum Teilen.");
    }
  }

  useEffect(() => {
    if (!joinCodeExpiresAt || loading) return;
    const delay = Math.max(0, new Date(joinCodeExpiresAt).getTime() - Date.now() + 250);
    const timer = window.setTimeout(() => { void loadTeam(); }, delay);
    return () => window.clearTimeout(timer);
  }, [joinCodeExpiresAt, loading, loadTeam]);

  async function changeMemberRole(member: Member, role: Member["role"]) {
    if (memberActionId) return;
    const explanation = role === "owner"
      ? `${member.email} erhält Inhaberrechte und kann künftig ebenfalls Mitglieder verwalten. Möchtest du fortfahren?`
      : `${member.email} verliert die Inhaberrechte. Möchtest du fortfahren?`;
    if (!window.confirm(explanation)) return;

    setMemberActionId(member.user_id);
    setMessage("");
    try {
      const { error } = await createClient().rpc("set_organization_member_role", {
        target_user_id: member.user_id,
        new_role: role,
      });
      if (error) throw error;
      setMessage(role === "owner" ? `${member.email} ist jetzt Inhaber.` : `${member.email} ist jetzt Mitglied.`);
      await loadTeam();
    } catch (cause) {
      const errorMessage = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
      setMessage(errorMessage.includes("schema cache") || errorMessage.includes("Could not find the function")
        ? "Die Teamverwaltung ist in der Datenbank noch nicht aktualisiert. Bitte die Supabase-Migrationen anwenden und es erneut versuchen."
        : errorMessage.includes("At least one workspace owner")
        ? "Im Veranstalterbereich muss mindestens ein Inhaber bleiben."
        : errorMessage ? `Die Rolle konnte nicht geändert werden: ${errorMessage}` : "Die Rolle konnte nicht geändert werden.");
    } finally {
      setMemberActionId("");
    }
  }

  async function removeMember(member: Member) {
    if (memberActionId || !window.confirm(`${member.email} aus dem gemeinsamen Veranstalterbereich entfernen? Die Person verliert dadurch den Zugriff auf gemeinsame Events und Sponsoren.`)) return;

    setMemberActionId(member.user_id);
    setMessage("");
    try {
      const { error } = await createClient().rpc("remove_organization_member", { target_user_id: member.user_id });
      if (error) throw error;
      setMessage(`${member.email} wurde aus dem Veranstalterbereich entfernt.`);
      await loadTeam();
    } catch (cause) {
      const errorMessage = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
      setMessage(errorMessage.includes("At least one workspace owner")
        ? "Der letzte Inhaber kann nicht entfernt werden. Ernenn zuerst eine weitere Person zum Inhaber."
        : errorMessage ? `Das Mitglied konnte nicht entfernt werden: ${errorMessage}` : "Das Mitglied konnte nicht entfernt werden.");
    } finally {
      setMemberActionId("");
    }
  }

  return <section className="team-settings" aria-labelledby="team-settings-title">
    <div className="settings-section">
      <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2 id="team-settings-title">Gemeinsamer Veranstalterbereich</h2><p>Jede Person nutzt ein eigenes Login und arbeitet mit denselben Events und Sponsoren.</p></div></div>
      {!isSupabaseConfigured ? <p className="auth-setup-message">Der Teamzugang ist verfügbar, sobald Supabase eingerichtet ist.</p> : <>
        {teamLoaded && !isOwner && <div className="team-member-invite-note" role="note"><span className="metric-icon"><Icon name="users" size={15}/></span><p>Nur Inhaber können neue Personen zum Veranstalterbereich einladen. Bitte wende dich an einen Inhaber, wenn jemand dazukommen soll.</p></div>}
        {isOwner && <div className="team-join-code">
          <div className="team-join-code-copy"><strong>Beitrittscode</strong><p>Teile diesen Code mit neuen Teammitgliedern. Er ist eine Stunde gültig und wird danach automatisch erneuert.</p></div>
          <div className="team-join-code-value">{loading ? <span className="subtitle">Code wird geladen …</span> : <><code>{joinCode || "—"}</code><button className="btn" type="button" title="Beitrittscode kopieren" aria-label="Beitrittscode kopieren" onClick={() => { void copyJoinCode(); }} disabled={!joinCode}><Icon name="file" size={14}/><span>Kopieren</span></button></>}</div>
          {joinCodeExpiresAt && <small className="team-join-code-expiry">Gültig bis {new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(joinCodeExpiresAt))} Uhr</small>}
          <ol className="team-join-code-steps">
            <li><strong>Code kopieren und teilen.</strong><span>Teile den Beitrittscode mit der neuen Person.</span></li>
            <li><strong>Beitritt auswählen.</strong><span>Die Person klickt auf „Registrieren“, wählt den Beitritt und gibt den Code ein.</span></li>
            <li><strong>Profil vervollständigen.</strong><span>Nach der Registrierung ergänzt sie im Wizard Vor- und Nachnamen.</span></li>
          </ol>
        </div>}
        <div className="team-members-list">
          <h3>Mitglieder</h3>
          <p className="team-members-note">Zugänge zum Veranstalterbereich verwalten. Das persönliche Login bleibt beim Entfernen bestehen.</p>
          {loading ? <p className="subtitle">Mitglieder werden geladen …</p> : <div className="team-member-grid">{members.map((member) => {
            const initials = member.full_name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SP";
            return <article className="team-member-card" key={member.user_id}>
              <span className="avatar">{initials}</span>
              <div className="team-member-identity">
                <b>{member.full_name || "Name noch nicht hinterlegt"}</b>
                <small className="team-member-email">{member.email}</small>
                <small>{member.role === "owner" ? "Inhaber" : "Mitglied"}{member.user_id === currentUserId ? " · Du" : ""}</small>
              </div>
              {isOwner && member.user_id !== currentUserId && <div className="team-member-actions">
                <button className="btn" type="button" disabled={Boolean(memberActionId)} onClick={() => { void changeMemberRole(member, member.role === "owner" ? "member" : "owner"); }}>{memberActionId === member.user_id ? "Wird gespeichert …" : member.role === "owner" ? "Zum Mitglied machen" : "Zum Inhaber ernennen"}</button>
                <button className="btn btn-danger" type="button" disabled={Boolean(memberActionId)} onClick={() => { void removeMember(member); }}>Zugang entfernen</button>
              </div>}
            </article>;
          })}</div>}
        </div>
      </>}
      {message && <p className="team-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  </section>;
}
