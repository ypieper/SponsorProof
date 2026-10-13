"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Member = { email: string; role: "owner" | "member"; joined_at: string };
type Invitation = { email: string; expires_at: string; created_at: string };

export function TeamSettings() {
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
      if (organizationError || typeof organizationId !== "string") throw new Error("workspace");
      const [memberResult, invitationResult] = await Promise.all([
        supabase.from("organization_members").select("email, role, joined_at").eq("organization_id", organizationId).order("joined_at"),
        supabase.from("organization_invitations").select("email, expires_at, created_at").eq("organization_id", organizationId).is("accepted_at", null).order("created_at", { ascending: false }),
      ]);
      if (memberResult.error) throw memberResult.error;
      setMembers((memberResult.data ?? []) as Member[]);
      setIsOwner((memberResult.data ?? []).some((member) => member.role === "owner"));
      setInvitations(invitationResult.error ? [] : (invitationResult.data ?? []) as Invitation[]);
    } catch {
      setMessage("Der gemeinsame Veranstalterbereich konnte nicht geladen werden. Bitte prüfe, ob die Datenbankmigration bereits ausgeführt wurde.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setMessage("");
    setInviteLink("");
    try {
      const supabase = createClient();
      const { data: token, error } = await supabase.rpc("create_organization_invitation", { invited_email: email.trim() });
      if (error || typeof token !== "string") throw error ?? new Error("invite");
      const url = new URL(`/team/join?token=${encodeURIComponent(token)}`, window.location.origin).toString();
      setInviteLink(url);
      setMessage("Einladungslink erstellt. Teile ihn mit der eingeladenen Person.");
      setEmail("");
      await loadTeam();
    } catch {
      setMessage("Die Einladung konnte nicht erstellt werden. Vielleicht gehört diese E-Mail-Adresse bereits zum Veranstalterbereich.");
    } finally {
      setSaving(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage("Einladungslink kopiert. Du kannst ihn jetzt versenden.");
    } catch {
      setMessage("Der Link ist bereit. Markiere das Feld und kopiere ihn zum Teilen.");
    }
  }

  return <section className="settings-panel-content team-settings" aria-labelledby="team-settings-title">
    <div className="settings-section">
      <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2 id="team-settings-title">Gemeinsamer Veranstalterbereich</h2><p>Jede Person nutzt ein eigenes Login und arbeitet mit denselben Events und Sponsoren.</p></div></div>
      {!isSupabaseConfigured ? <p className="auth-setup-message">Der Teamzugang ist verfügbar, sobald Supabase eingerichtet ist.</p> : <>
        {isOwner && <form className="team-invite-form" onSubmit={createInvitation}>
          <label className="settings-field"><span>E-Mail-Adresse einladen</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@veranstalter.de" /></label>
          <button className="btn btn-primary" type="submit" disabled={saving || loading}><Icon name="plus" size={15}/>{saving ? "Wird erstellt …" : "Einladungslink erstellen"}</button>
        </form>}
        {inviteLink && <div className="team-invite-link"><label className="settings-field"><span>Einladungslink</span><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label><button className="btn" type="button" onClick={() => { void copyInviteLink(); }}><Icon name="file" size={14}/>Link kopieren</button><p>Der Link ist 7 Tage gültig. Die eingeladene Person meldet sich mit genau dieser E-Mail-Adresse an.</p></div>}
        <div className="team-members-list"><h3>Mitglieder</h3>{loading ? <p className="subtitle">Mitglieder werden geladen …</p> : members.map((member) => <div className="team-member-row" key={member.email}><span className="avatar">{member.email.slice(0, 2).toUpperCase() || "SP"}</span><div><b>{member.email}</b><small>{member.role === "owner" ? "Inhaber" : "Mitglied"}</small></div></div>)}</div>
        {isOwner && invitations.length > 0 && <div className="team-members-list"><h3>Offene Einladungen</h3>{invitations.map((invitation) => <div className="team-invitation-row" key={`${invitation.email}-${invitation.created_at}`}><span>{invitation.email}</span><small>Gültig bis {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" }).format(new Date(invitation.expires_at))}</small></div>)}</div>}
      </>}
      {message && <p className="team-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  </section>;
}
