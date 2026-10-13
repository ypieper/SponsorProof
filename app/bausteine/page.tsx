"use client";

import { useEffect, useState, type FormEvent } from "react";
import { blocks as starterBlocks } from "@/lib/demo-data";
import { Icon, PageHeading } from "@/components/ui";

type Block = (typeof starterBlocks)[number];
const defaultCategories = ["Werbung", "Social Media", "Hospitality"];
const storageKey = "sponsorproof.blocks.v1";
const categoryStorageKey = "sponsorproof.block-categories.v1";
const emptyDraft = { title: "", category: "Werbung", description: "", detail: "", value: "" };

export default function LibraryPage() {
  const [category, setCategory] = useState("Alle Bausteine");
  const [items, setItems] = useState<Block[]>(starterBlocks);
  const [categories, setCategories] = useState(defaultCategories);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState("");
  const [moveToCategory, setMoveToCategory] = useState(defaultCategories[0]);
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setItems([...starterBlocks, ...(JSON.parse(saved) as Block[])]);
      const savedCategories = localStorage.getItem(categoryStorageKey);
      if (savedCategories) setCategories([...new Set([...defaultCategories, ...(JSON.parse(savedCategories) as string[])])]);
    } catch {
      setMessage("Gespeicherte Bausteine konnten nicht geladen werden.");
    } finally {
      setReady(true);
    }
  }, []);

  const shown = items.filter((block) => category === "Alle Bausteine" || block.category === category);

  function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const block: Block = { ...draft, title: draft.title.trim(), description: draft.description.trim(), detail: draft.detail.trim(), value: draft.value.trim() };
    const customItems = [...items.slice(starterBlocks.length), block];
    try {
      localStorage.setItem(storageKey, JSON.stringify(customItems));
      setItems([...starterBlocks, ...customItems]);
      setCategory("Alle Bausteine");
      setDraft(emptyDraft);
      setShowCreate(false);
      setMessage("Baustein gespeichert.");
    } catch {
      setMessage("Der Baustein konnte nicht gespeichert werden.");
    }
  }

  function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = newCategory.trim();
    if (!label || categories.some((item) => item.toLocaleLowerCase("de-DE") === label.toLocaleLowerCase("de-DE"))) return;
    const updated = [...categories, label];
    try {
      localStorage.setItem(categoryStorageKey, JSON.stringify(updated.filter((item) => !defaultCategories.includes(item))));
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

  function removeCategory(categoryName: string) {
    if (!categoryName) return;
    const customCategories = categories.filter((item) => item !== categoryName);
    const fallback = categories.find((item) => item !== categoryName) ?? "Werbung";
    const destination = moveToCategory || fallback;
    const movedCount = items.filter((item) => item.category === categoryName).length;
    const updatedItems = items.map((item) => item.category === categoryName ? { ...item, category: destination } : item);
    try {
      localStorage.setItem(categoryStorageKey, JSON.stringify(customCategories.filter((item) => !defaultCategories.includes(item))));
      localStorage.setItem(storageKey, JSON.stringify(updatedItems.slice(starterBlocks.length)));
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
    <PageHeading eyebrow="VORLAGEN" title="Bausteinbibliothek" subtitle="Wiederverwendbare Leistungen für deine Sponsoringverträge." action={<button className="btn btn-primary" type="button" onClick={() => { setMessage(""); setShowCreate(true); }}><Icon name="plus" size={16}/> Baustein erstellen</button>}/>
    <p className="subtitle" role="status" aria-live="polite" style={{ margin: "-13px 0 16px", minHeight: 14 }}>{message || (ready ? "Eigene Bausteine werden in diesem Browser gespeichert." : "Bausteine werden geladen …")}</p>
    <div className="library-filter" aria-label="Bausteine filtern"><button type="button" onClick={() => setCategory("Alle Bausteine")} aria-pressed={category === "Alle Bausteine"} className={`filter-chip ${category === "Alle Bausteine" ? "active" : ""}`}>Alle Bausteine</button>{categories.map((item) => <span className={`category-filter-chip ${category === item ? "active" : ""}`} key={item}><button type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className="filter-chip">{item}</button>{!defaultCategories.includes(item) && <button type="button" className="category-remove-button" aria-label={`Kategorie ${item} entfernen`} title={`Kategorie ${item} entfernen`} onClick={() => { if (items.some((block) => block.category === item)) { setCategoryToDelete(item); setMoveToCategory(categories.find((other) => other !== item) ?? "Werbung"); } else removeCategory(item); }}>Entfernen</button>}</span>)}<button className="btn" type="button" onClick={() => { setShowCategoryForm((value) => !value); setMessage(""); }}><Icon name="plus" size={13}/> Kategorie hinzufügen</button></div>
    {showCategoryForm && <form className="category-create-form" onSubmit={createCategory}><label className="settings-field"><span>Neue Kategorie</span><input autoFocus required maxLength={35} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="z. B. Printwerbung" /></label><button className="btn btn-primary" type="submit">Hinzufügen</button><button className="btn" type="button" onClick={() => setShowCategoryForm(false)}>Abbrechen</button></form>}
    {categoryToDelete && <div className="category-delete-form"><div><strong>Kategorie „{categoryToDelete}“ entfernen?</strong><p>Zugehörige Bausteine bleiben erhalten und werden einer anderen Kategorie zugeordnet.</p></div><label className="settings-field"><span>Zielkategorie</span><select value={moveToCategory} onChange={(event) => setMoveToCategory(event.target.value)}>{categories.filter((item) => item !== categoryToDelete).map((item) => <option key={item}>{item}</option>)}</select></label><button className="btn btn-primary" type="button" onClick={() => removeCategory(categoryToDelete)}>Bausteine verschieben und Kategorie entfernen</button><button className="btn" type="button" onClick={() => setCategoryToDelete("")}>Abbrechen</button></div>}
    <div className="library-grid">{shown.map((block, index) => <article className="block-card" key={`${block.title}-${index}`}><span className="block-icon"><Icon name={block.category === "Social Media" ? "spark" : block.category === "Hospitality" ? "users" : "layers"} size={17}/></span><h3>{block.title}</h3><p>{block.description}</p><div className="block-footer"><span>{block.category} · {block.detail}</span><b>{block.value}</b></div></article>)}{shown.length === 0 && <div className="library-empty"><strong>Noch keine Bausteine in „{category}“</strong><p>Erstelle den ersten Baustein für diese Kategorie.</p><button className="btn btn-primary" type="button" onClick={() => { setDraft({ ...emptyDraft, category }); setShowCreate(true); }}><Icon name="plus" size={14}/> Baustein erstellen</button></div>}</div>
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-block-title"><div className="create-modal-head"><div><h2 id="create-block-title">Baustein erstellen</h2><p>Lege eine wiederverwendbare Leistung für deine Verträge an.</p></div><button className="icon-button" type="button" aria-label="Dialog schließen" onClick={() => setShowCreate(false)}><Icon name="close" size={16}/></button></div><form onSubmit={createBlock}><div className="settings-grid"><label className="settings-field settings-field-full"><span>Name *</span><input autoFocus required maxLength={70} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="z. B. Logo auf Event-Website" /></label><label className="settings-field"><span>Kategorie *</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="settings-field"><span>Richtwert</span><input value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="z. B. ab 350 €" /></label><label className="settings-field settings-field-full"><span>Beschreibung *</span><textarea required maxLength={240} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Was beinhaltet diese Leistung?" /></label><label className="settings-field settings-field-full"><span>Details</span><input value={draft.detail} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} placeholder="z. B. Online · dauerhaft" /></label></div><div className="create-modal-actions"><button className="btn" type="button" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="btn btn-primary" type="submit" disabled={!ready}>Baustein speichern</button></div></form></section></div>}
  </main>;
}
