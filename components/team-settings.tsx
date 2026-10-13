"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Member = { user_id: string; email: string; role: "owner" | "member"; joined_at: string };
type Invitation = { email: string; expires_at: string; created_at: string };

export function TeamSettings() {
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberActionId, setMemberActionId] = useState("");
  const [message, setMessage] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const loadTeam = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const [{ data: userResult, error: userError }, { data: organizationId, error: organizationError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("current_organization_id"),
      ]);
      if (userError || !userResult.user || organizationError || typeof organizationId !== "string") throw new Error("workspace");
      const [memberResult, invitationResult] = await Promise.all([
        supabase.from("organization_members").select("user_id, email, role, joined_at").eq("organization_id", organizationId).order("joined_at"),
        supabase.from("organization_invitations").select("email, expires_at, created_at").eq("organization_id", organizationId).is("accepted_at", null).order("created_at", { ascending: false }),
      ]);
      if (memberResult.error) throw memberResult.error;
      setMembers((memberResult.data ?? []) as Member[]);
      setCurrentUserId(userResult.user.id);
      setIsOwner((memberResult.data ?? []).some((member) => member.user_id === userResult.user.id && member.role === "owner"));
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
    } catch (cause) {
      const errorMessage = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
      if (errorMessage.includes("already belongs")) {
        setMessage("Diese E-Mail-Adresse gehört bereits zum Veranstalterbereich.");
      } else if (errorMessage.includes("Only the workspace owner")) {
        setMessage("Nur die Inhaberin oder der Inhaber des Veranstalterbereichs kann Einladungen erstellen.");
      } else if (errorMessage.includes("valid email")) {
        setMessage("Bitte gib eine gültige E-Mail-Adresse ein.");
      } else {
        setMessage(errorMessage ? `Einladung konnte nicht erstellt werden: ${errorMessage}` : "Einladung konnte nicht erstellt werden. Bitte versuche es erneut.");
      }
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
      setMessage(errorMessage.includes("At least one workspace owner")
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

  return <section className="settings-panel-content team-settings" aria-labelledby="team-settings-title">
    <div className="settings-section">
      <div className="settings-section-heading"><span className="settings-section-icon"><Icon name="users" size={16}/></span><div><h2 id="team-settings-title">Gemeinsamer Veranstalterbereich</h2><p>Jede Person nutzt ein eigenes Login und arbeitet mit denselben Events und Sponsoren.</p></div></div>
      {!isSupabaseConfigured ? <p className="auth-setup-message">Der Teamzugang ist verfügbar, sobald Supabase eingerichtet ist.</p> : <>
        {isOwner && <form className="team-invite-form" onSubmit={createInvitation}>
          <label className="settings-field"><span>E-Mail-Adresse einladen</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@veranstalter.de" /></label>
          <button className="btn btn-primary" type="submit" disabled={saving || loading}><Icon name="plus" size={15}/>{saving ? "Wird erstellt …" : "Einladungslink erstellen"}</button>
        </form>}
        {inviteLink && <div className="team-invite-link"><label className="settings-field"><span>Einladungslink</span><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label><button className="btn" type="button" onClick={() => { void copyInviteLink(); }}><Icon name="file" size={14}/>Link kopieren</button><p>Der Link ist 7 Tage gültig. Die eingeladene Person meldet sich mit genau dieser E-Mail-Adresse an.</p></div>}
        <div className="team-members-list"><h3>Mitglieder</h3><p className="team-members-note">Zugänge zum Veranstalterbereich verwalten. Das persönliche Login bleibt beim Entfernen bestehen.</p>{loading ? <p className="subtitle">Mitglieder werden geladen …</p> : members.map((member) => <div className="team-member-row" key={member.user_id}><span className="avatar">{member.email.slice(0, 2).toUpperCase() || "SP"}</span><div className="team-member-identity"><b>{member.email}</b><small>{member.role === "owner" ? "Inhaber" : "Mitglied"}{member.user_id === currentUserId ? " · Du" : ""}</small></div>{isOwner && member.user_id !== currentUserId && <div className="team-member-actions"><button className="btn" type="button" disabled={Boolean(memberActionId)} onClick={() => { void changeMemberRole(member, member.role === "owner" ? "member" : "owner"); }}>{memberActionId === member.user_id ? "Wird gespeichert …" : member.role === "owner" ? "Zum Mitglied machen" : "Zum Inhaber ernennen"}</button><button className="btn btn-danger" type="button" disabled={Boolean(memberActionId)} onClick={() => { void removeMember(member); }}>Zugang entfernen</button></div>}</div>)}</div>
        {isOwner && invitations.length > 0 && <div className="team-members-list"><h3>Offene Einladungen</h3>{invitations.map((invitation) => <div className="team-invitation-row" key={`${invitation.email}-${invitation.created_at}`}><span>{invitation.email}</span><small>Gültig bis {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" }).format(new Date(invitation.expires_at))}</small></div>)}</div>}
      </>}
      {message && <p className="team-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  </section>;
}
