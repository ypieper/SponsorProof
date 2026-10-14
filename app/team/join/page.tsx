import { JoinWorkspace } from "@/components/join-workspace";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Team beitreten", "Nimm deine Einladung an und tritt dem Veranstalterbereich bei.");

export default async function JoinWorkspacePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="content"><JoinWorkspace token={token ?? ""} /></main>;
}
