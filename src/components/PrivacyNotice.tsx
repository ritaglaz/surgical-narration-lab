export function PrivacyNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Do not upload videos with identifiable patient information unless this
        system has been institutionally approved and secured for that use.
      </p>
    );
  }

  return (
    <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
      <strong className="font-semibold">Privacy notice.</strong> This MVP is
      intended for de-identified research media or non-PHI demo content. Do not
      upload videos containing identifiable patient information unless your
      institution has reviewed, approved, and secured the deployment. Free-tier
      hosting is not HIPAA-compliant.
    </aside>
  );
}
