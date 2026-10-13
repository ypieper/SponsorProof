import { JoinWorkspace } from "@/components/join-workspace";

export default async function JoinWorkspacePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="content"><JoinWorkspace token={token ?? ""} /></main>;
}
