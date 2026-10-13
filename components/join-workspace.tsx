"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, PageHeading } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function JoinWorkspace({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Einladung wird geprüft …");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function accept() {
      if (!token) {
        setFailed(true);
        setMessage("Der Einladungslink ist unvollständig.");
        return;
      }
      if (!isSupabaseConfigured) {
        setFailed(true);
        setMessage("Der Teamzugang ist derzeit nicht verfügbar.");
        return;
      }
      const { data: { user }, error: userError } = await createClient().auth.getUser();
      if (userError || !user) {
        const next = `/team/join?token=${encodeURIComponent(token)}`;
        router.replace(`/login?mode=signup&next=${encodeURIComponent(next)}`);
        return;
      }
      const { error } = await createClient().rpc("accept_organization_invitation", { invitation_token: token });
      if (error) {
        if (active) {
          setFailed(true);
          setMessage(error.message.includes("different email")
            ? "Diese Einladung wurde an eine andere E-Mail-Adresse gesendet. Melde dich mit der eingeladenen Adresse an."
            : error.message.includes("already belongs")
              ? "Dieses Konto gehört bereits zu einem Veranstalterbereich. Verwende für die Einladung ein neues Konto."
              : "Der Einladungslink ist ungültig oder abgelaufen. Bitte bitte den Inhaber um einen neuen Link.");
        }
        return;
      }
      if (active) {
        setMessage("Du bist jetzt Teil des Veranstalterbereichs. Weiterleitung …");
        router.replace("/");
        router.refresh();
      }
    }
    void accept();
    return () => { active = false; };
  }, [router, token]);

  return <>
    <PageHeading eyebrow="TEAMZUGANG" title={failed ? "Einladung nicht angenommen" : "Veranstalterbereich beitreten"} subtitle="Dein eigenes Login erhält Zugriff auf Events und Sponsoren des Veranstalterbereichs." />
    <section className="panel join-workspace-panel"><span className={`join-workspace-icon ${failed ? "failed" : ""}`}><Icon name={failed ? "close" : "users"} size={20}/></span><p role="status">{message}</p>{failed && <button className="btn" type="button" onClick={() => router.push("/einstellungen")}>Zu den Einstellungen</button>}</section>
  </>;
}
