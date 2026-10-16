"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, Icon, iconNames, PageHeading } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type BenefitType = "monetary" | "in_kind";
type CompletionType = "file_required" | "organizer_approval" | "sponsor_approval" | "sponsor_upload";
type Block = { title: string; category: string; description: string; detail: string; icon?: string; benefit_type?: BenefitType; material_logistics?: string | null; default_completion_type?: Exclude<CompletionType, "sponsor_approval" | "sponsor_upload"> };
type TemplateSubtask = { id: string; title: string; sort_order: number; completion_type: CompletionType };
type DraftSubtask = { key: string; title: string; completionType: CompletionType };
type LibraryBlock = Block & { id: string; origin: "custom"; subtasks: TemplateSubtask[] };
type DatabaseBlock = { id: string; title: string; category: string; description: string; detail: string; icon: string | null; benefit_type?: BenefitType; material_logistics?: string | null; default_completion_type?: "file_required" | "organizer_approval" };
const defaultCategories = ["Werbung", "Social Media", "Hospitality"];
const blockIconLabels: Record<string, string> = {
  grid: "Kacheln", stack: "Drei Quadrate", calendar: "Kalender", users: "Personen", check: "Häkchen",
  layers: "Ebenen", settings: "Einstellungen", bell: "Glocke", plus: "Plus", arrow: "Pfeil",
  camera: "Kamera", pin: "Standort", menu: "Menü", close: "Schließen", chevron: "Pfeil rechts",
  clock: "Uhr", spark: "Social Media", file: "Dokument",
};
const emptyDraft = { title: "", category: "Werbung", description: "", icon: "stack", benefitType: "monetary" as BenefitType, materialLogistics: "", defaultCompletionType: "file_required" as "file_required" | "organizer_approval", subtasks: [] as DraftSubtask[] };
const completionOptions: Array<{ value: CompletionType; label: string }> = [
  { value: "file_required", label: "Datei erforderlich" },
  { value: "organizer_approval", label: "Bestätigung durch Veranstalter" },
  { value: "sponsor_approval", label: "Freigabe durch Sponsor" },
  { value: "sponsor_upload", label: "Upload durch Sponsor" },
];

function allowedCompletionTypesAfter(previous: CompletionType): CompletionType[] {
  if (previous === "file_required") return ["file_required", "organizer_approval", "sponsor_upload"];
  if (previous === "sponsor_approval") return ["file_required", "organizer_approval", "sponsor_upload"];
  if (previous === "sponsor_upload") return ["file_required", "organizer_approval"];
  return completionOptions.map((option) => option.value);
}

function invalidWorkflowTransitionIndex(subtasks: DraftSubtask[]) {
  return subtasks.findIndex((task, index) => index > 0 && !allowedCompletionTypesAfter(subtasks[index - 1].completionType).includes(task.completionType));
}
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
let pendingLibraryLoad: Promise<{ items: LibraryBlock[]; seedError: boolean; subtasksUnavailable?: boolean }> | null = null;

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
  const [subtasksUnavailable, setSubtasksUnavailable] = useState(false);
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
                .select("id, title, category, description, detail, icon, benefit_type, material_logistics, default_completion_type")
                .order("created_at", { ascending: true });
              if (loadError) throw loadError;

              let rows = (existingRows ?? []) as DatabaseBlock[];
              if (rows.length === 0) {
                const initialBlocks = [...exampleBlocks];
                const uniqueBlocks = initialBlocks.filter((block, index) => initialBlocks.findIndex((candidate) => candidate.title.trim().toLocaleLowerCase("de-DE") === block.title.trim().toLocaleLowerCase("de-DE")) === index);
                const { data: insertedRows, error: insertError } = await supabase.from("benefit_templates")
                  .insert(uniqueBlocks.map((block) => ({ ...block, icon: block.icon ?? "stack", benefit_type: block.benefit_type ?? "monetary", default_completion_type: "file_required" })))
                  .select("id, title, category, description, detail, icon, benefit_type, material_logistics, default_completion_type");
                if (insertError) throw insertError;
                rows = (insertedRows ?? []) as DatabaseBlock[];
              } else {
                const knownTitles = new Set(rows.map((block) => block.title.trim().toLocaleLowerCase("de-DE")));
                const missingExamples = exampleBlocks.filter((block) => !knownTitles.has(block.title.toLocaleLowerCase("de-DE")));
                if (missingExamples.length > 0) {
                  const { data: insertedRows, error: insertError } = await supabase.from("benefit_templates")
                    .insert(missingExamples.map((block) => ({ ...block, icon: block.icon ?? "stack", benefit_type: block.benefit_type ?? "monetary", default_completion_type: "file_required" })))
                    .select("id, title, category, description, detail, icon, benefit_type, material_logistics, default_completion_type");
                  if (insertError) return { items: rows.map((block) => ({ ...block, icon: block.icon ?? undefined, origin: "custom" as const, subtasks: [] })), seedError: true };
                  rows = [...rows, ...((insertedRows ?? []) as DatabaseBlock[])];
                }
              }
              const templateIds = rows.map((block) => block.id);
              const { data: subtaskRows, error: subtaskError } = templateIds.length
                ? await supabase.from("benefit_template_tasks").select("id, benefit_template_id, title, sort_order, completion_type").in("benefit_template_id", templateIds).order("sort_order")
                : { data: [], error: null };
              if (subtaskError) {
                return { items: rows.map((block) => ({ ...block, icon: block.icon ?? undefined, origin: "custom" as const, subtasks: [] })), seedError: false, subtasksUnavailable: true };
              }
              const subtasksByTemplate = new Map<string, TemplateSubtask[]>();
              for (const task of subtaskRows ?? []) {
                const current = subtasksByTemplate.get(task.benefit_template_id) ?? [];
                current.push({ id: task.id, title: task.title, sort_order: task.sort_order, completion_type: task.completion_type });
                subtasksByTemplate.set(task.benefit_template_id, current);
              }
              return { items: rows.map((block) => ({ ...block, benefit_type: block.benefit_type ?? "monetary", icon: block.icon ?? undefined, origin: "custom" as const, subtasks: subtasksByTemplate.get(block.id) ?? [] })), seedError: false };
            })();
          }
          const pending = pendingLibraryLoad;
          if (!pending) throw new Error("Die Bausteine konnten nicht geladen werden.");
          try {
            const loadResult = await pending;
            customItems = loadResult.items;
            if (loadResult.subtasksUnavailable) {
              setSubtasksUnavailable(true);
              setMessage("Die Bausteine wurden geladen. Unteraufgaben sind erst verfügbar, wenn die aktuelle Datenbankmigration eingespielt ist.");
            }
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
    setDraft({ title: block.title, category: block.category, description: block.description, icon: block.icon ?? defaultIconForCategory(block.category), benefitType: block.benefit_type ?? "monetary", materialLogistics: block.material_logistics ?? "", defaultCompletionType: block.default_completion_type ?? "file_required", subtasks: block.subtasks.map((task) => ({ key: task.id, title: task.title, completionType: task.completion_type })) });
    setShowCreate(true);
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (subtasksUnavailable && draft.subtasks.length > 0) {
      setMessage("Unteraufgaben können erst gespeichert werden, wenn die aktuelle Datenbankmigration eingespielt ist.");
      return;
    }
    const invalidTransition = invalidWorkflowTransitionIndex(draft.subtasks);
    if (invalidTransition >= 0) {
      setMessage("Diese Aufgabenfolge ist nicht möglich. Nach einem Sponsor-Upload kann nur eine Veranstalter-Bestätigung oder ein Datei-Upload durch den Veranstalter folgen.");
      return;
    }
    setSaving(true);
    const details = { title: draft.title.trim(), category: draft.category, description: draft.description.trim(), detail: "", icon: draft.icon, benefit_type: draft.benefitType, material_logistics: draft.materialLogistics.trim() || null, default_completion_type: draft.defaultCompletionType };
    try {
      let updatedItems: LibraryBlock[];
      if (isSupabaseConfigured) {
        const supabase = createClient();
        const query = editingBlockId
          ? supabase.from("benefit_templates").update(details).eq("id", editingBlockId).select("id, title, category, description, detail, icon, benefit_type, material_logistics, default_completion_type").single()
          : supabase.from("benefit_templates").insert(details).select("id, title, category, description, detail, icon, benefit_type, material_logistics, default_completion_type").single();
        const { data, error } = await query;
        if (error || !data) throw error ?? new Error("Baustein konnte nicht gespeichert werden.");
        let savedSubtasks: TemplateSubtask[] = [];
        if (!subtasksUnavailable) {
          const subtasks = draft.subtasks.map((task) => ({ title: task.title.trim(), completion_type: task.completionType })).filter((task) => task.title);
          const { error: deleteSubtasksError } = await supabase.from("benefit_template_tasks").delete().eq("benefit_template_id", data.id);
          if (deleteSubtasksError) throw deleteSubtasksError;
          if (subtasks.length) {
            const { data: insertedSubtasks, error: insertSubtasksError } = await supabase.from("benefit_template_tasks")
              .insert(subtasks.map((task, index) => ({ benefit_template_id: data.id, ...task, sort_order: index })))
              .select("id, title, sort_order, completion_type");
            if (insertSubtasksError) throw insertSubtasksError;
            savedSubtasks = (insertedSubtasks ?? []) as TemplateSubtask[];
          }
        }
        const saved = { ...data, icon: data.icon ?? undefined, origin: "custom" as const, subtasks: savedSubtasks } as LibraryBlock;
        updatedItems = editingBlockId ? items.map((block) => block.id === editingBlockId ? saved : block) : [...items, saved];
      } else throw new Error("Supabase ist nicht eingerichtet.");
      setItems(updatedItems);
      setCategory("Alle Bausteine");
      setDraft(emptyDraft);
      setIconPickerOpen(false);
      setEditingBlockId(null);
      setShowCreate(false);
      setMessage(editingBlockId ? "Baustein aktualisiert." : "Baustein gespeichert.");
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("TASK_WORKFLOW_INVALID_TRANSITION")
        ? "Diese Aufgabenfolge ist nicht möglich. Bitte passe die Abschlussarten der Unteraufgaben an."
        : "Der Baustein konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function addDraftSubtask() {
    setDraft((current) => ({ ...current, subtasks: [...current.subtasks, { key: crypto.randomUUID(), title: "", completionType: "file_required" }] }));
  }

  function updateDraftSubtask(key: string, title: string) {
    setDraft((current) => ({ ...current, subtasks: current.subtasks.map((task) => task.key === key ? { ...task, title } : task) }));
  }

  function removeDraftSubtask(key: string) {
    setDraft((current) => ({ ...current, subtasks: current.subtasks.filter((task) => task.key !== key) }));
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
    <PageHeading eyebrow="VORLAGEN" title="Vertragsbausteine" subtitle="Wiederverwendbare Leistungen für deine Sponsoringverträge." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setEditingBlockId(null); setDraft(emptyDraft); setIconPickerOpen(false); setShowCreate(true); }}><Icon name="plus" size={16}/> Baustein erstellen</button>}/>
    <p className="subtitle library-message" role="status" aria-live="polite">{message || (ready ? "Deine Bausteine werden sicher in deinem Konto gespeichert." : "Bausteine werden geladen …")}</p>
    <div className="library-filter" aria-label="Bausteine filtern"><button type="button" onClick={() => setCategory("Alle Bausteine")} aria-pressed={category === "Alle Bausteine"} className={`filter-chip ${category === "Alle Bausteine" ? "active" : ""}`}>Alle Bausteine</button>{categories.map((item) => <span className={`category-filter-chip ${category === item ? "active" : ""}`} key={item}><button type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className="filter-chip">{item}</button>{!defaultCategories.includes(item) && <button type="button" className="category-remove-button" aria-label={`Kategorie ${item} entfernen`} title={`Kategorie ${item} entfernen`} onClick={() => { if (items.some((block) => block.category === item)) { setCategoryToDelete(item); setMoveToCategory(categories.find((other) => other !== item) ?? "Werbung"); } else removeCategory(item); }}>Entfernen</button>}</span>)}<button className="btn" type="button" onClick={() => { setShowCategoryForm((value) => !value); setMessage(""); }}><Icon name="plus" size={13}/> Kategorie hinzufügen</button></div>
    {showCategoryForm && <form className="category-create-form" onSubmit={createCategory}><label className="settings-field"><span>Neue Kategorie</span><input autoFocus required maxLength={35} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="z. B. Printwerbung" /></label><button className="btn btn-primary" type="submit">Hinzufügen</button><button className="btn" type="button" onClick={() => setShowCategoryForm(false)}>Abbrechen</button></form>}
    {categoryToDelete && <div className="category-delete-form"><div><strong>Kategorie „{categoryToDelete}“ entfernen?</strong><p>Zugehörige Bausteine bleiben erhalten und werden einer anderen Kategorie zugeordnet.</p></div><label className="settings-field"><span>Zielkategorie</span><select value={moveToCategory} onChange={(event) => setMoveToCategory(event.target.value)}>{categories.filter((item) => item !== categoryToDelete).map((item) => <option key={item}>{item}</option>)}</select></label><button className="btn btn-primary" type="button" onClick={() => removeCategory(categoryToDelete)}>Bausteine verschieben und Kategorie entfernen</button><button className="btn" type="button" onClick={() => setCategoryToDelete("")}>Abbrechen</button></div>}
    <div className="library-grid">
      {shown.map((block) => <article className="block-card" key={block.id}>
        <span className="block-icon"><Icon name={block.icon ?? defaultIconForCategory(block.category)} size={17}/></span>
        <h3>{block.title}</h3>
        <p>{block.description}</p>
        <div className="block-footer"><span>{block.category} · {block.benefit_type === "in_kind" ? "Sachleistung" : "Geldleistung"}</span><div className="block-actions">
          <button className="btn block-edit-button" type="button" onClick={() => editBlock(block)}>Bearbeiten</button>
          <button className="btn block-delete-button" type="button" onClick={() => deleteBlock(block)} aria-label={`${block.title} löschen`}>Löschen</button>
        </div></div>
      </article>)}
      {ready && !libraryError && shown.length === 0 && <EmptyState className="empty-state-fill" title={category === "Alle Bausteine" ? "Noch keine Bausteine" : `Noch keine Bausteine in „${category}“`} description="Erstelle deinen ersten Baustein für wiederverwendbare Sponsoringleistungen." action={<button className="btn btn-primary" type="button" onClick={() => { setDraft({ ...emptyDraft, category: category === "Alle Bausteine" ? defaultCategories[0] : category, icon: defaultIconForCategory(category === "Alle Bausteine" ? defaultCategories[0] : category) }); setEditingBlockId(null); setShowCreate(true); }}><Icon name="plus" size={14}/> Baustein erstellen</button>} />}
    </div>
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); } }}><section className="create-modal block-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-block-title"><div className="create-modal-head"><div><h2 id="create-block-title">{editingBlockId ? "Baustein bearbeiten" : "Baustein erstellen"}</h2><p>{editingBlockId ? "Passe die Angaben für diesen Baustein an." : "Lege eine wiederverwendbare Leistung mit Aufgaben für die Umsetzung an."}</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); }}><Icon name="close" size={16}/></button></div><form onSubmit={saveBlock}><aside className="library-info" aria-label="Information zu Vertragsbausteinen"><span className="library-info-icon"><Icon name="layers" size={16}/></span><p>Wenn du einen Vertragsbaustein einem Sponsor in einem Event zuordnest, entstehen daraus automatisch Aufgaben zur Umsetzung der vereinbarten Leistung. Bei Bausteinen mit Unteraufgaben übernehmen die Aufgaben deren Reihenfolge und Abschlussart.</p></aside><div className="settings-grid"><label className="settings-field settings-field-full"><span>Name *</span><input autoFocus required maxLength={70} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="z. B. Logo auf Event-Website" /></label><label className="settings-field"><span>Kategorie *</span><select value={draft.category} onChange={(event) => { const nextCategory = event.target.value; setDraft({ ...draft, category: nextCategory, icon: defaultIconForCategory(nextCategory) }); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="settings-field"><span>Leistungsart *</span><select value={draft.benefitType} onChange={(event) => setDraft((current) => ({ ...current, benefitType: event.target.value as BenefitType }))}><option value="monetary">Geldleistung</option><option value="in_kind">Sachleistung</option></select></label><div className="settings-field"><span>Icon</span><div className="icon-picker" ref={iconPickerRef}><button className="icon-picker-trigger" type="button" aria-haspopup="true" aria-expanded={iconPickerOpen} aria-label={`Icon auswählen, aktuell ${blockIconLabels[draft.icon] ?? draft.icon}`} onClick={() => setIconPickerOpen((open) => !open)}><span className="icon-picker-current"><span className="block-icon"><Icon name={draft.icon} size={18}/></span><span>{blockIconLabels[draft.icon] ?? draft.icon}</span></span><Icon name="chevron" size={15}/></button>{iconPickerOpen && <div className="icon-picker-options" role="group" aria-label="Verfügbare Icons">{iconNames.map((iconName) => <button key={iconName} type="button" className={`icon-picker-option ${draft.icon === iconName ? "selected" : ""}`} aria-label={blockIconLabels[iconName] ?? iconName} aria-pressed={draft.icon === iconName} title={blockIconLabels[iconName] ?? iconName} onClick={() => { setDraft((current) => ({ ...current, icon: iconName })); setIconPickerOpen(false); }}><Icon name={iconName} size={18}/></button>)}</div>}</div></div><label className="settings-field settings-field-full"><span>Beschreibung *</span><textarea required maxLength={240} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Was beinhaltet diese Leistung?" /></label></div><label className="settings-field settings-field-full"><span>Zusätzliche Sachleistung oder Materiallogistik (optional)</span><input maxLength={160} value={draft.materialLogistics} onChange={(event) => setDraft((current) => ({ ...current, materialLogistics: event.target.value }))} placeholder="z. B. Banner beim Sponsor abholen"/><small>Die Vertragsleistung bleibt ihrer Leistungsart zugeordnet. Dieser Eintrag erscheint zusätzlich im Reiter „Sachleistungen“; Bedarfstermin und Zuständigkeit werden bei der Zuordnung zum Event festgelegt.</small></label>{draft.subtasks.length === 0 && <div className="benefit-template-main-completion"><label className="settings-field"><span>Abschlussart der Hauptaufgabe</span><select value={draft.defaultCompletionType} onChange={(event) => setDraft((current) => ({ ...current, defaultCompletionType: event.target.value as "file_required" | "organizer_approval" }))}><option value="file_required">Datei-Upload durch Veranstalter</option><option value="organizer_approval">Bestätigung durch Veranstalter</option></select></label></div>}<section className="benefit-template-subtasks"><div className="benefit-template-subtasks-heading"><div><b>Unteraufgaben</b><p>Die Aufgaben laufen nacheinander: Jede startet, sobald die vorherige abgeschlossen ist.</p><div className="benefit-template-workflow-warning"><b>Beachte bitte:</b><span>Auf eine Datei-Aufgabe des Veranstalters kann keine Sponsor-Freigabe folgen. Nach einer Sponsor-Aufgabe kann eine Veranstalter-Bestätigung oder ein Datei-Upload folgen. Ein Sponsor-Upload kann nicht direkt von einer weiteren Sponsor-Aufgabe gefolgt werden.</span></div></div><button className="btn" type="button" onClick={addDraftSubtask} disabled={subtasksUnavailable}><Icon name="plus" size={14}/> Aufgabe hinzufügen</button></div>{draft.subtasks.length > 0 && <div className="benefit-template-subtask-list">{draft.subtasks.map((task, index) => { const allowed = index === 0 ? completionOptions.map((option) => option.value) : allowedCompletionTypesAfter(draft.subtasks[index - 1].completionType); return <div className="benefit-template-subtask-row" key={task.key}><span>{index + 1}</span><div className="benefit-template-subtask-fields"><div className="benefit-template-subtask-title"><label className="settings-field"><span>Aufgabenbezeichnung</span><input aria-label={`Unteraufgabe ${index + 1}`} required maxLength={100} value={task.title} onChange={(event) => updateDraftSubtask(task.key, event.target.value)} placeholder="z. B. Reel abstimmen und veröffentlichen"/></label><small className="subtask-dependency-hint">{index === 0 ? "Startet sofort" : `Startet nach Abschluss von: ${draft.subtasks[index - 1].title || `Unteraufgabe ${index}`}`}</small></div><label className="settings-field"><span>Abschlussart</span><select value={task.completionType} onChange={(event) => setDraft((current) => ({ ...current, subtasks: current.subtasks.map((item) => item.key === task.key ? { ...item, completionType: event.target.value as CompletionType } : item) }))}>{completionOptions.map((option) => <option key={option.value} value={option.value} disabled={!allowed.includes(option.value)}>{option.label}{index > 0 && !allowed.includes(option.value) ? " (nicht möglich)" : ""}</option>)}</select></label></div><button className="icon-button" type="button" aria-label={`Unteraufgabe ${index + 1} entfernen`} onClick={() => removeDraftSubtask(task.key)}><Icon name="trash" size={14}/></button></div>})}{invalidWorkflowTransitionIndex(draft.subtasks) >= 0 && <p className="form-error" role="alert">Diese Aufgabenfolge ist nicht möglich. Nach einem Sponsor-Upload kann nur eine Veranstalter-Bestätigung oder ein Datei-Upload folgen.</p>}</div>}</section><div className="create-modal-actions"><button className="btn" type="button" onClick={() => { setShowCreate(false); setEditingBlockId(null); setIconPickerOpen(false); }}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready || saving}>{saving ? "Wird gespeichert …" : editingBlockId ? "Änderungen speichern" : "Baustein speichern"}</button></div></form></section></div>}
    {deletingBlock && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingBlock(null); }}><section className="create-modal block-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-block-title"><div className="create-modal-head"><div><h2 id="delete-block-title">Baustein löschen?</h2><p>„{deletingBlock.title}“ wird aus der Bibliothek entfernt. Bereits erstellte Vertragsleistungen bleiben erhalten.</p></div></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setDeletingBlock(null)}>Abbrechen</button><button className="btn block-delete-confirm" type="button" onClick={confirmDeleteBlock}>Baustein löschen</button></div></section></div>}
  </main>;
}
