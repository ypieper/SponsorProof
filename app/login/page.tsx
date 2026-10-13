import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const params = await searchParams;
  const invitation = params.next?.startsWith("/team/join") ?? false;
  const initialMode = params.mode === "signup" && invitation ? "signup" : "login";
  return <main className="auth-page"><AuthForm initialMode={initialMode} invitation={invitation} /></main>;
}
