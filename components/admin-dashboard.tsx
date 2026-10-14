"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, PageHeading } from "@/components/ui";
import { AdminActivationCodes } from "@/components/admin-activation-codes";
import { AdminEnterpriseAccess } from "@/components/admin-enterprise-access";
import { AdminContactRequests } from "@/components/admin-contact-requests";

type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string | null;
  organizationName: string;
  workspaceRole: "owner" | "member" | null;
  platformAdmin: boolean;
  suspended: boolean;
  lastSignInAt: string | null;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "codes" | "enterprise" | "contacts">("users");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setConfigured(response.status !== 503);
        setIsAdmin(response.status !== 403);
        setMessage(result.error ?? "Die Benutzer konnten nicht geladen werden.");
        return;
      }
      setUsers(result.users);
      setCurrentUserId(result.currentUserId ?? "");
      setConfigured(true);
      setIsAdmin(true);
    } catch {
      setMessage("Die Benutzer konnten nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("de-DE");
    if (!normalized) return users;
    return users.filter((user) => `${user.firstName} ${user.lastName} ${user.email} ${user.organizationName}`.toLocaleLowerCase("de-DE").includes(normalized));
  }, [query, users]);

  async function saveUser(user: AdminUser) {
    setSaving(user.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: user.firstName, lastName: user.lastName, ...(user.organizationId && user.workspaceRole ? { organizationId: user.organizationId, workspaceRole: user.workspaceRole } : {}), platformAdmin: user.platformAdmin, suspended: user.suspended }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Änderungen konnten nicht gespeichert werden.");
      setMessage("Änderungen wurden gespeichert.");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Änderungen konnten nicht gespeichert werden.");
    } finally {
      setSaving(null);
    }
  }

  function updateUser(id: string, updates: Partial<AdminUser>) {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...updates } : user));
  }

  return <main className="content admin-content">
    <PageHeading eyebrow="PLATTFORM" title="Administration" subtitle="Alle Plattform-Admins sehen und verwalten dieselben Daten über alle Veranstalterbereiche hinweg." />
    {!configured ? <section className="panel admin-notice"><span className="metric-icon"><Icon name="settings" size={16}/></span><div><strong>Admin-Verwaltung noch nicht eingerichtet</strong><p>Hinterlege den serverseitigen Supabase Service-Role-Key in der lokalen Umgebung und in Vercel. Der Schlüssel bleibt ausschließlich auf dem Server.</p></div></section>
      : !isAdmin ? <section className="panel admin-notice"><span className="metric-icon"><Icon name="users" size={16}/></span><div><strong>Kein Zugriff</strong><p>Dieser Bereich ist nur für plattformweite Admins verfügbar.</p></div></section>
        : <>
          <nav className="tabs admin-tabs" aria-label="Administration"><button type="button" className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}>Benutzer</button><button type="button" className={activeTab === "codes" ? "active" : ""} onClick={() => setActiveTab("codes")}>Freischaltcodes</button><button type="button" className={activeTab === "enterprise" ? "active" : ""} onClick={() => setActiveTab("enterprise")}>Enterprise</button><button type="button" className={activeTab === "contacts" ? "active" : ""} onClick={() => setActiveTab("contacts")}>Kontaktanfragen</button></nav>
          {activeTab === "codes" ? <AdminActivationCodes/> : activeTab === "enterprise" ? <AdminEnterpriseAccess/> : activeTab === "contacts" ? <AdminContactRequests/> : <>
          <section className="panel admin-toolbar"><div><strong>{users.length} Benutzerkonten</strong><p>Profil, Veranstalterrolle und Zugang zentral verwalten.</p></div><label className="admin-search"><span className="sr-only">Benutzer suchen</span><Icon name="users" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, E-Mail oder Veranstalter suchen" /></label></section>
          {message && <p className="admin-feedback" role="status">{message}</p>}
          {loading ? <section className="panel admin-empty">Benutzer werden geladen …</section> : filteredUsers.length === 0 ? <section className="panel admin-empty">Keine passenden Benutzer gefunden.</section> : <div className="admin-user-list">
            {filteredUsers.map((user) => <article className="panel admin-user-card" key={user.id}>
              <div className="admin-user-heading"><div className="avatar">{`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}` || user.email.slice(0, 2).toUpperCase()}</div><div className="admin-user-identity"><strong>{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Name nicht hinterlegt"}</strong><span>{user.email}</span></div><span className={`admin-access-badge ${user.suspended ? "suspended" : "active"}`}>{user.suspended ? "Zugang gesperrt" : "Zugang aktiv"}</span></div>
              <div className="admin-user-fields">
                <label className="settings-field"><span>Vorname</span><input value={user.firstName} onChange={(event) => updateUser(user.id, { firstName: event.target.value })} /></label>
                <label className="settings-field"><span>Nachname</span><input value={user.lastName} onChange={(event) => updateUser(user.id, { lastName: event.target.value })} /></label>
                <div className="admin-user-workspace"><span>Veranstalterbereich</span><strong>{user.organizationName}</strong></div>
                {user.organizationId && <label className="settings-field"><span>Rolle im Veranstalterbereich</span><select value={user.workspaceRole ?? "member"} onChange={(event) => updateUser(user.id, { workspaceRole: event.target.value as "owner" | "member" })}><option value="owner">Inhaber</option><option value="member">Mitglied</option></select></label>}
              </div>
              <div className="admin-user-actions">
                <label className="admin-toggle"><input type="checkbox" checked={user.platformAdmin} disabled={user.id === currentUserId} onChange={(event) => updateUser(user.id, { platformAdmin: event.target.checked })} /><span>Plattform-Admin</span></label>
                <button className={`btn ${user.suspended ? "" : "btn-danger-soft"}`} type="button" disabled={user.id === currentUserId} onClick={() => updateUser(user.id, { suspended: !user.suspended })}>{user.suspended ? "Zugang freigeben" : "Zugang sperren"}</button>
                <button className="btn btn-primary" type="button" disabled={saving === user.id} onClick={() => void saveUser(user)}><Icon name="check" size={15}/>{saving === user.id ? "Wird gespeichert …" : "Änderungen speichern"}</button>
              </div>
            </article>)}
          </div>}
          </>}
        </>}
  </main>;
}
