"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, Icon, iconNames, PageHeading } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Block = { title: string; category: string; description: string; detail: string; icon?: string };
type LibraryBlock = Block & { id: string; origin: "custom" };
type DatabaseBlock = { id: string; title: string; category: string; description: string; detail: string; icon: string | null };
const defaultCategories = ["Werbung", "Social Media", "Hospitality"];
const blockIconLabels: Record<string, string> = {
  grid: "Kacheln", stack: "Drei Quadrate", calendar: "Kalender", users: "Personen", check: "Häkchen",
  layers: "Ebenen", settings: "Einstellungen", bell: "Glocke", plus: "Plus", arrow: "Pfeil",
  camera: "Kamera", pin: "Standort", menu: "Menü", close: "Schließen", chevron: "Pfeil rechts",
  clock: "Uhr", spark: "Social Media", file: "Dokument",
};
const emptyDraft = { title: "", category: "Werbung", description: "", detail: "", icon: "stack" };
const exampleBlocks: Block[] = [
  { title: "Hauptbanner am Eingang", category: "Werbung", description: "Das Logo des Sponsors wird gut sichtbar auf dem zentralen Eingangsbanner platziert. Die Gestaltung erfolgt im abgestimmten Eventdesign, sodass Besucher den Sponsor beim Betreten und Verlassen des Veranstaltungsgeländes wahrnehmen.", detail: "Eingangsbereich · Großformat", icon: "stack" },
  { title: "Logo auf der Event-Website", category: "Werbung", description: "Das Sponsorlogo erscheint während der gesamten Bewerbungs- und Veranstaltungsphase im Sponsorenbereich der Event-Website. Die Verlinkung führt direkt zur Website des Sponsors und wird vor Veröffentlichung abgestimmt.", detail: "Online · mit Verlinkung", icon: "grid" },
  { title: "Logo auf Drucksachen", category: "Werbung", description: "Das Logo wird auf den vereinbarten Drucksachen wie Programmheft, Plakat oder Veranstaltungsflyer berücksichtigt. Größe und Platzierung richten sich nach dem Sponsoringpaket und werden vor Druckfreigabe mit dem Sponsor abgestimmt.", detail: "Print · nach Format", icon: "file" },
  { title: "Werbefläche auf dem Veranstaltungsgelände", category: "Werbung", description: "Dem Sponsor wird eine vereinbarte Werbefläche auf dem Gelände zur Verfügung gestellt. Der Veranstalter stimmt Standort, Format, Anlieferung und Aufbau rechtzeitig ab und dokumentiert die sichtbare Platzierung während der Veranstaltung.", detail: "Gelände · Aufbau vor Ort", icon: "pin" },
  { title: "Bandenwerbung im Bühnenbereich", category: "Werbung", description: "Der Sponsor wird mit einem Banner oder einer Bande im gut einsehbaren Bühnenbereich präsentiert. Motiv, Maße und Anbringung werden vorab abgestimmt; nach dem Aufbau wird die Platzierung für den späteren Leistungsnachweis fotografiert.", detail: "Bühnenbereich · Fotobeleg", icon: "camera" },
  { title: "Instagram-Beitrag zur Partnerschaft", category: "Social Media", description: "Der Veranstalter veröffentlicht einen eigenen Instagram-Beitrag, der die Partnerschaft vorstellt und den Beitrag mit dem Sponsorprofil verknüpft. Text und Bildmaterial werden rechtzeitig abgestimmt und der veröffentlichte Beitrag als Nachweis gesichert.", detail: "Instagram · Feed-Beitrag", icon: "spark" },
  { title: "Instagram-Story am Veranstaltungstag", category: "Social Media", description: "Am Veranstaltungstag wird eine Instagram-Story mit sichtbarer Nennung oder Markierung des Sponsors veröffentlicht. Das Motiv zeigt einen passenden Bezug zur Veranstaltung; ein Screenshot der veröffentlichten Story wird als Leistungsnachweis abgelegt.", detail: "Instagram · Veranstaltungstag", icon: "spark" },
  { title: "Sponsorennennung im Newsletter", category: "Social Media", description: "Der Sponsor wird in einem redaktionell passenden Newsletter an die angemeldeten Veranstaltungsinteressierten genannt. Versandzeitpunkt und Wortlaut werden abgestimmt; die finale E-Mail oder ein Versand-Screenshot dient als Nachweis.", detail: "Newsletter · vor dem Event", icon: "file" },
  { title: "VIP-Tickets für den Sponsor", category: "Hospitality", description: "Der Sponsor erhält das vereinbarte Kontingent an VIP-Tickets zur Weitergabe an Mitarbeitende oder Gäste. Anzahl, Übergabe und gegebenenfalls benötigte Gästeinformationen werden vor der Veranstaltung mit der Ansprechperson abgestimmt.", detail: "Ticketkontingent · Gästeliste", icon: "users" },
  { title: "Zugang zum Hospitality-Bereich", category: "Hospitality", description: "Für die benannten Gäste des Sponsors wird der Zugang zum Hospitality-Bereich organisiert. Der Veranstalter stimmt Anzahl und Ankunftszeit ab und sorgt am Veranstaltungstag für einen klaren Empfang und die vereinbarten Leistungen vor Ort.", detail: "Empfang · Veranstaltungstag", icon: "check" },
];
let pendingLibraryLoad: Promise<{ items: LibraryBlock[]; seedError: boolean }> | null = null;

function defaultIconForCategory(categoryName: string) {
  if (categoryName === "Social Media") return "spark";
  if (categoryName === "Hospitality") return "users";
  return "stack";
}

export default function LibraryPage() {
  const [category, setCategory] = useState("Alle Bausteine");
  const [items, setItems] = useState<LibraryBlock[]>([]);
  const [categories, setCategories] = useState(defaultCategories);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState("");
  const [moveToCategory, setMoveToCategory] = useState(defaultCategories[0]);
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<LibraryBlock | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");
  const [libraryError, setLibraryError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let customItems: LibraryBlock[];
        if (isSupabaseConfigured) {
          if (!pendingLibraryLoad) {
            pendingLibraryLoad = (async () => {
              const supabase = createClient();
              const { data: authData, error: authError } = await supabase.auth.getUser();
              if (authError || !authData.user) throw new Error("Bitte melde dich an, um deine Bausteine zu laden.");

              const { data: existingRows, error: loadError } = await supabase.from("benefit_templates")
                .select("id, title, category, description, detail, icon")
                .order("created_at", { ascending: true });
              if (loadError) throw loadError;

              let rows = (existingRows ?? []) as DatabaseBlock[];
              if (rows.length === 0) {
                const initialBlocks = [...exampleBlocks];
                const uniqueBlocks = initialBlocks.filter((block, index) => initialBlocks.findIndex((candidate) => candidate.title.trim().toLocaleLowerCase("de-DE") === block.title.trim().toLocaleLowerCase("de-DE")) === index);
                const { data: insertedRows, error: insertError } = await supabase.from("benefit_templates")
                  .insert(uniqueBlocks.map((block) => ({ ...block, icon: block.icon ?? "stack" })))
                  .select("id, title, category, description, detail, icon");
                if (insertError) throw insertError;
                rows = (insertedRows ?? []) as DatabaseBlock[];
              } else {
                const knownTitles = new Set(rows.map((block) => block.title.trim().toLocaleLowerCase("de-DE")));
                const missingExamples = exampleBlocks.filter((block) => !knownTitles.has(block.title.toLocaleLowerCase("de-DE")));
                if (missingExamples.length > 0) {
                  const { data: insertedRows, error: insertError } = await supabase.from("benefit_templates")
                    .insert(missingExamples.map((block) => ({ ...block, icon: block.icon ?? "stack" })))
                    .select("id, title, category, description, detail, icon");
                  if (insertError) return { items: rows.map((block) => ({ ...block, icon: block.icon ?? undefined, origin: "custom" as const })), seedError: true };
                  rows = [...rows, ...((insertedRows ?? []) as DatabaseBlock[])];
                }
              }
              return { items: rows.map((block) => ({ ...block, icon: block.icon ?? undefined, origin: "custom" as const })), seedError: false };
            })();
          }
          const pending = pendingLibraryLoad;
          if (!pending) throw new Error("Die Bausteine konnten nicht geladen werden.");
          try {
            const loadResult = await pending;
            customItems = loadResult.items;
            if (loadResult.seedError) setMessage("Vorhandene Bausteine wurden geladen, aber die Beispielbausteine konnten nicht vollständig angelegt werden.");
          } finally {
            if (pendingLibraryLoad === pending) pendingLibraryLoad = null;
          }
        } else customItems = [];
        if (active) setItems(customItems);
        if (isSupabaseConfigured) {
          const { data: categoryRows, error: categoryError } = await createClient().from("organization_benefit_categories").select("name").order("name");
          if (categoryError) throw categoryError;
          if (active) setCategories([...new Set([...defaultCategories, ...(categoryRows ?? []).map((row) => row.name)])]);
        }
      } catch (error) {
        if (active) {
          setLibraryError(true);
          setMessage(error instanceof Error && error.message.includes("benefit_templates") ? "Die Baustein-Tabelle fehlt in Supabase noch. Bitte führe zuerst die Datenbankmigration aus." : error instanceof Error ? error.message : "Bausteine konnten nicht aus der Datenbank geladen werden.");
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!iconPickerOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!iconPickerRef.current?.contains(event.target as Node)) setIconPickerOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIconPickerOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [iconPickerOpen]);

  const shown = items.filter((block) => category === "Alle Bausteine" || block.category === category);

  function editBlock(block: LibraryBlock) {
    setMessage("");
    setEditingBlockId(block.id);
    setDraft({ title: block.title, category: block.category, description: block.description, detail: block.detail, icon: block.icon ?? defaultIconForCategory(block.category) });
    setShowCreate(true);
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const details = { ...draft, title: draft.title.trim(), description: draft.description.trim(), detail: draft.detail.trim() };
    try {
      let updatedItems: LibraryBlock[];
      if (isSupabaseConfigured) {
        const supabase = createClient();
        const query = editingBlockId
          ? supabase.from("benefit_templates").update(details).eq("id", editingBlockId).select("id, title, category, description, detail, icon").single()
          : supabase.from("benefit_templates").insert(details).select("id, title, category, description, detail, icon").single();
        const { data, error } = await query;
        if (error || !data) throw error ?? new Error("Baustein konnte nicht gespeichert werden.");
        const saved = { ...data, icon: data.icon ?? undefined, origin: "custom" as const } as LibraryBlock;
        updatedItems = editingBlockId ? items.map((block) => block.id === editingBlockId ? saved : block) : [...items, saved];
      } else throw new Error("Supabase ist nicht eingerichtet.");
      setItems(updatedItems);
      setCategory("Alle Bausteine");
      setDraft(emptyDraft);
      setIconPickerOpen(false);
      setEditingBlockId(null);
      setShowCreate(false);
      setMessage(editingBlockId ? "Baustein aktualisiert." : "Baustein gespeichert.");
    } catch {
      setMessage("Der Baustein konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function deleteBlock(block: LibraryBlock) {
    setDeletingBlock(block);
  }

  async function confirmDeleteBlock() {
    if (!deletingBlock) return;
    const updatedItems = items.filter((item) => item.id !== deletingBlock.id);
    try {
      if (isSupabaseConfigured) {
        const { error } = await createClient().from("benefit_templates").delete().eq("id", deletingBlock.id);
        if (error) throw error;
      } else throw new Error("Supabase ist nicht eingerichtet.");
      setItems(updatedItems);
      setMessage(`Baustein „${deletingBlock.title}“ gelöscht.`);
      setDeletingBlock(null);
    } catch {
      setMessage("Der Baustein konnte nicht gelöscht werden.");
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = newCategory.trim();
    if (!label || categories.some((item) => item.toLocaleLowerCase("de-DE") === label.toLocaleLowerCase("de-DE"))) return;
    const updated = [...categories, label];
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase ist nicht eingerichtet.");
      const { data: organizationId, error: organizationError } = await createClient().rpc("current_organization_id");
      if (organizationError || typeof organizationId !== "string") throw organizationError ?? new Error("Veranstalterbereich nicht gefunden.");
      const { error } = await createClient().from("organization_benefit_categories").insert({ organization_id: organizationId, name: label });
      if (error) throw error;
      setCategories(updated);
      setCategory(label);
      setDraft((current) => ({ ...current, category: label }));
      setNewCategory("");
      setShowCategoryForm(false);
      setMessage(`Kategorie „${label}“ hinzugefügt.`);
    } catch {
      setMessage("Die Kategorie konnte nicht gespeichert werden.");
    }
  }

  async function removeCategory(categoryName: string) {
    if (!categoryName) return;
    const customCategories = categories.filter((item) => item !== categoryName);
    const fallback = categories.find((item) => item !== categoryName) ?? "Werbung";
    const destination = moveToCategory || fallback;
    const movedCount = items.filter((item) => item.category === categoryName).length;
    const updatedItems = items.map((item) => item.category === categoryName ? { ...item, category: destination } : item);
    try {
      if (isSupabaseConfigured) {
        const movedBlocks = updatedItems.filter((item) => item.category === destination && items.find((previous) => previous.id === item.id)?.category === categoryName);
        const updates = await Promise.all(movedBlocks.map((item) => createClient().from("benefit_templates").update({ category: destination }).eq("id", item.id)));
        if (updates.some(({ error }) => error)) throw new Error("Die Bausteine konnten nicht verschoben werden.");
      } else throw new Error("Supabase ist nicht eingerichtet.");
      const { data: organizationId, error: organizationError } = await createClient().rpc("current_organization_id");
      if (organizationError || typeof organizationId !== "string") throw organizationError ?? new Error("Veranstalterbereich nicht gefunden.");
      const { error: deleteError } = await createClient().from("organization_benefit_categories").delete().eq("organization_id", organizationId).eq("name", categoryName);
      if (deleteError) throw deleteError;
      setItems(updatedItems);
      setCategories(customCategories);
      setCategory((current) => current === categoryName ? "Alle Bausteine" : current);
      setDraft((current) => current.category === categoryName ? { ...current, category: destination } : current);
      setCategoryToDelete("");
      setMessage(movedCount > 0 ? `Kategorie „${categoryName}“ entfernt. ${movedCount} Baustein${movedCount === 1 ? " wurde" : "e wurden"} nach „${destination}“ verschoben.` : `Kategorie „${categoryName}“ entfernt.`);
    } catch {
      setMessage("Die Kategorie konnte nicht entfernt werden.");
    }
  }

  return <main className="content">
    <PageHeading eyebrow="VORLAGEN" title="Bausteinbibliothek" subtitle="Wiederverwendbare Leistungen für deine Sponsoringverträge." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setEditingBlockId(null); setDraft(emptyDraft); setIconPickerOpen(false); setShowCreate(true); }}><Icon name="plus" size={16}/> Baustein erstellen</button>}/>
    <p className="subtitle library-message" role="status" aria-live="polite">{message || (ready ? "Deine Bausteine werden sicher in deinem Konto gespeichert." : "Bausteine werden geladen …")}</p>
    <div className="library-filter" aria-label="Bausteine filtern"><button type="button" onClick={() => setCategory("Alle Bausteine")} aria-pressed={category === "Alle Bausteine"} className={`filter-chip ${category === "Alle Bausteine" ? "active" : ""}`}>Alle Bausteine</button>{categories.map((item) => <span className={`category-filter-chip ${category === item ? "active" : ""}`} key={item}><button type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className="filter-chip">{item}</button>{!defaultCategories.includes(item) && <button type="button" className="category-remove-button" aria-label={`Kategorie ${item} entfernen`} title={`Kategorie ${item} entfernen`} onClick={() => { if (items.some((block) => block.category === item)) { setCategoryToDelete(item); setMoveToCategory(categories.find((other) => other !== item) ?? "Werbung"); } else removeCategory(item); }}>Entfernen</button>}</span>)}<button className="btn" type="button" onClick={() => { setShowCategoryForm((value) => !value); setMessage(""); }}><Icon name="plus" size={13}/> Kategorie hinzufügen</button></div>
    {showCategoryForm && <form className="category-create-form" onSubmit={createCategory}><label className="settings-field"><span>Neue Kategorie</span><input autoFocus required maxLength={35} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="z. B. Printwerbung" /></label><button className="btn btn-primary" type="submit">Hinzufügen</button><button className="btn" type="button" onClick={() => setShowCategoryForm(false)}>Abbrechen</button></form>}
    {categoryToDelete && <div className="category-delete-form"><div><strong>Kategorie „{categoryToDelete}“ entfernen?</strong><p>Zugehörige Bausteine bleiben erhalten und werden einer anderen Kategorie zugeordnet.</p></div><label className="settings-field"><span>Zielkategorie</span><select value={moveToCategory} onChange={(event) => setMoveToCategory(event.target.value)}>{categories.filter((item) => item !== categoryToDelete).map((item) => <option key={item}>{item}</option>)}</select></label><button className="btn btn-primary" type="button" onClick={() => removeCategory(categoryToDelete)}>Bausteine verschieben und Kategorie entfernen</button><button className="btn" type="button" onClick={() => setCategoryToDelete("")}>Abbrechen</button></div>}
    <div className="library-grid">{shown.map((block) => <article className="block-card" key={block.id}><span className="block-icon"><Icon name={block.icon ?? defaultIconForCategory(block.category)} size={17}/></span><h3>{block.title}</h3><p>{block.description}</p><div className="block-footer"><span>{block.category}{block.detail ? ` · ${block.detail}` : ""}</span><div className="block-actions"><button className="btn block-edit-button" type="button" onClick={() => editBlock(block)}>Bearbeiten</button><button className="btn block-delete-button" type="button" onClick={() => deleteBlock(block)} aria-label={`${block.title} löschen`}>Löschen</button></div></div></article>)}{ready && !libraryError && shown.length === 0 && <EmptyState className="empty-state-fill" title={category === "Alle Bausteine" ? "Noch keine Bausteine" : `Noch keine Bausteine in „${category}“`} description="Erstelle deinen ersten Baustein für wiederverwendbare Sponsoringleistungen." action={<button className="btn btn-primary" type="button" onClick={() => { setDraft({ ...emptyDraft, category: category === "Alle Bausteine" ? defaultCategories[0] : category, icon: defaultIconForCategory(category === "Alle Bausteine" ? defaultCategories[0] : category) }); setEditingBlockId(null); setShowCreate(true); }}><Icon name="plus" size={14}/> Baustein erstellen</button>} />}</div>
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); } }}><section className="create-modal block-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-block-title"><div className="create-modal-head"><div><h2 id="create-block-title">{editingBlockId ? "Baustein bearbeiten" : "Baustein erstellen"}</h2><p>{editingBlockId ? "Passe die Angaben für diesen Baustein an." : "Lege eine wiederverwendbare Leistung für deine Verträge an."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); }}><Icon name="close" size={16}/></button></div><form onSubmit={saveBlock}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Name *</span><input autoFocus required maxLength={70} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="z. B. Logo auf Event-Website" /></label><label className="settings-field"><span>Kategorie *</span><select value={draft.category} onChange={(event) => { const nextCategory = event.target.value; setDraft({ ...draft, category: nextCategory, icon: defaultIconForCategory(nextCategory) }); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><div className="settings-field"><span>Icon</span><div className="icon-picker" ref={iconPickerRef}><button className="icon-picker-trigger" type="button" aria-haspopup="true" aria-expanded={iconPickerOpen} aria-label={`Icon auswählen, aktuell ${blockIconLabels[draft.icon] ?? draft.icon}`} onClick={() => setIconPickerOpen((open) => !open)}><span className="icon-picker-current"><span className="block-icon"><Icon name={draft.icon} size={18}/></span><span>{blockIconLabels[draft.icon] ?? draft.icon}</span></span><Icon name="chevron" size={15}/></button>{iconPickerOpen && <div className="icon-picker-options" role="group" aria-label="Verfügbare Icons">{iconNames.map((iconName) => <button key={iconName} type="button" className={`icon-picker-option ${draft.icon === iconName ? "selected" : ""}`} aria-label={blockIconLabels[iconName] ?? iconName} aria-pressed={draft.icon === iconName} title={blockIconLabels[iconName] ?? iconName} onClick={() => { setDraft((current) => ({ ...current, icon: iconName })); setIconPickerOpen(false); }}><Icon name={iconName} size={18}/></button>)}</div>}</div></div><label className="settings-field settings-field-full"><span>Beschreibung *</span><textarea required maxLength={240} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Was beinhaltet diese Leistung?" /></label><label className="settings-field settings-field-full"><span>Details</span><input value={draft.detail} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} placeholder="z. B. Online · dauerhaft" /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); }}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready || saving}>{saving ? "Wird gespeichert …" : editingBlockId ? "Änderungen speichern" : "Baustein speichern"}</button></div></form></section></div>}
    {deletingBlock && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingBlock(null); }}><section className="create-modal block-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-block-title"><div className="create-modal-head"><div><h2 id="delete-block-title">Baustein löschen?</h2><p>„{deletingBlock.title}“ wird aus der Bibliothek entfernt. Bereits erstellte Vertragsleistungen bleiben erhalten.</p></div></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setDeletingBlock(null)}>Abbrechen</button><button className="btn block-delete-confirm" type="button" onClick={confirmDeleteBlock}>Baustein löschen</button></div></section></div>}
  </main>;
}
