import Link from "next/link";
import { PhotoCapture } from "@/components/photo-capture";
import { Icon, Status } from "@/components/ui";
import { MobileMenu } from "@/components/mobile-menu";

const openEvidence = [
  { title: "Hauptbanner am Eingang", sponsor: "Sparkasse", context: "Werbung · Haupteingang", count: "1 Foto fehlt" },
  { title: "Logo auf Getränkebecher", sponsor: "Veltins", context: "Werbung · Gastronomie", count: "Nachweis offen" },
  { title: "VIP-Bereich dokumentieren", sponsor: "Autohaus König", context: "Hospitality · Backstage", count: "2 Fotos fehlen" },
];

export default function EventModePage() {
  return <div className="mobile-shell"><header className="mobile-header"><Link href="/" className="brand"><span className="brand-mark"><Icon name="check" size={17}/></span>SponsorProof</Link><div className="mobile-header-actions"><MobileMenu/><Link href="/events/open-air-kino-2027" className="icon-button" aria-label="Zurück zum Event"><Icon name="chevron" size={16}/></Link></div></header><main className="mobile-content"><span className="live-pill"><span className="live-dot"/> EVENT-MODUS</span><h1>Open-Air-Kino 2027</h1><p className="mobile-sub">Tempelhofer Feld · Tag 1 von 6</p><div className="mobile-progress"><div className="mobile-progress-head"><span>Nachweise dokumentiert</span><b>18 / 26</b></div><div className="progress-track"><div className="progress-fill" style={{width:"69%"}}/></div></div><div className="panel-heading" style={{marginBottom:11}}><div><h2>Offene Nachweise</h2><p>Ein Foto reicht oft schon aus.</p></div><span className="status status-progress">3 offen</span></div>{openEvidence.map((item) => <article className="mobile-task" key={item.title}><div className="mobile-task-top"><Status value="Offen"/><span style={{color:"#8e98a2"}}><Icon name="chevron" size={15}/></span></div><h3>{item.title}</h3><p>{item.sponsor} · {item.context}</p><PhotoCapture/><div className="mobile-task-foot" style={{marginTop:11}}><span>{item.count}</span><span><Icon name="pin" size={12}/> Ort hinzufügen</span></div></article>)}<div style={{textAlign:"center",marginTop:17}}><Link href="/events/open-air-kino-2027" className="text-link">← Zur Event-Übersicht</Link></div></main><nav className="mobile-nav"><Link href="/event-modus" className="active"><Icon name="check" size={17}/>Offen</Link><Link href="/events/open-air-kino-2027?tab=nachweise"><Icon name="camera" size={17}/>Nachweise</Link><Link href="/events/open-air-kino-2027"><Icon name="grid" size={17}/>Event</Link></nav></div>;
}
