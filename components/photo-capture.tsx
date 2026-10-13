"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";

export function PhotoCapture() {
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  return <>
    <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(event) => setSelected(event.target.files?.[0]?.name ?? "")}/>
    <button className="photo-button" onClick={() => input.current?.click()}><Icon name="camera" size={18}/>{selected ? "Foto ausgewählt" : "Foto hinzufügen"}</button>
    {selected && <div style={{fontSize:10,color:"#75818e",marginTop:8,textAlign:"center"}}>{selected} · lokal ausgewählt</div>}
  </>;
}
