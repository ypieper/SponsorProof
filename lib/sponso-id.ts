/** Stable, human-readable public ID; the random code is generated once in the database. */
export function formatSponsoId(sponsoId: string) {
  return sponsoId.trim().toUpperCase();
}
