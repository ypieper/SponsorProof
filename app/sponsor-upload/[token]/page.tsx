import { PublicPageFrame } from "@/components/public-page-frame";
import { SponsorUploadPortal } from "@/components/sponsor-upload-portal";
import { findActiveSponsorUploadLink, sponsorUploadBucket } from "@/lib/sponsor-upload-server";

export const dynamic = "force-dynamic";

export default async function SponsorUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await findActiveSponsorUploadLink(token);
  const { data: organizerLogo } = record?.organizerLogoPath
    ? await record.admin.storage.from(sponsorUploadBucket).createSignedUrl(record.organizerLogoPath, 60 * 60 * 24)
    : { data: null };

  return <PublicPageFrame showLoginLink={false} partnerLogoUrl={organizerLogo?.signedUrl ?? null}><main className="public-page-content sponsor-upload-page"><SponsorUploadPortal token={token}/></main></PublicPageFrame>;
}
