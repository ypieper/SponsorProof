import { NextResponse } from "next/server";
import { normalizeCityName } from "@/lib/location";

type Locality = {
  name?: unknown;
  postalcode?: unknown;
  postalCode?: unknown;
  municipality?: { name?: unknown } | null;
};

export async function GET(request: Request) {
  const postalCode = new URL(request.url).searchParams.get("postalCode") ?? "";
  if (!/^\d{5}$/.test(postalCode)) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  try {
    const url = new URL("https://openplzapi.org/de/Localities");
    url.searchParams.set("postalCode", postalCode);
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "lookup-unavailable" }, { status: 503 });
    }

    const localities = await response.json() as Locality[];
    const match = localities.find((locality) => String(locality.postalcode ?? locality.postalCode ?? "") === postalCode);
    const rawCity = match
      ? (typeof match.municipality?.name === "string" ? match.municipality.name : typeof match.name === "string" ? match.name : "")
      : "";
    const city = normalizeCityName(rawCity);

    return NextResponse.json({ valid: Boolean(city), city }, { status: city ? 200 : 404 });
  } catch {
    return NextResponse.json({ error: "lookup-unavailable" }, { status: 503 });
  }
}
