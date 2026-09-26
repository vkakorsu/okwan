"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerDocument } from "@/app/app/actions";
import { photosToPdf } from "@/lib/client/scan-to-pdf";
import { createClient } from "@/lib/supabase/browser";
import { Button, Field, inputCls } from "./ui";

const KINDS: { value: string; label: string; visa?: "F1" | "B1B2" }[] = [
  { value: "ds160", label: "DS-160 answers (the full printout, not just the confirmation page)" },
  { value: "i20", label: "I-20", visa: "F1" },
  { value: "admission_letter", label: "Admission letter", visa: "F1" },
  { value: "scholarship_letter", label: "Scholarship or financial aid letter", visa: "F1" },
  { value: "academic_record", label: "Transcript, certificate or test scores", visa: "F1" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "sponsor_letter", label: "Sponsor letter" },
  { value: "employment_letter", label: "Employment letter" },
  { value: "business_registration", label: "Business registration" },
  { value: "property", label: "Property document" },
  { value: "invitation_letter", label: "Invitation letter", visa: "B1B2" },
  { value: "refusal_letter", label: "Previous refusal letter" },
  { value: "appointment_confirmation", label: "Appointment confirmation" },
  { value: "passport_bio", label: "Passport bio page (the one with your photo)" },
  { value: "passport_travel_page", label: "Passport pages with visas and stamps" },
  { value: "other", label: "Other" },
];

export function DocumentUploader(props: { caseId: string; userId: string; visaType: "F1" | "B1B2"; supabaseUrl: string; publishableKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const files = (form.getAll("file") as File[]).filter((f) => f.size > 0);
    const kind = String(form.get("kind"));
    if (!files.length) return;
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length && files.length > 1) return setError("Upload one PDF, or several photos of the pages, not both.");
    setBusy(true);
    setError(null);
    try {
      let file: Blob & { name?: string } = files[0];
      if (!pdfs.length) {
        // Photos of the pages become one PDF, so the document is read as a whole.
        try {
          file = new File([await photosToPdf(files)], "scan.pdf", { type: "application/pdf" });
        } catch {
          // e.g. HEIC on a browser that can't decode it: a single photo can still go as it is.
          if (files.length > 1) throw new Error("We couldn't process these photos. Try JPEG photos, or a PDF scan.");
        }
      }
      if (file.size > 10 * 1024 * 1024) throw new Error("That's over 10 MB. Try fewer pages per upload, or a smaller scan.");
      const name = file instanceof File ? file.name : "scan.pdf";
      const ext = (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${props.userId}/${props.caseId}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient(props.supabaseUrl, props.publishableKey);
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const registered = await registerDocument(props.caseId, kind, path);
      if ("error" in registered) throw new Error(registered.error);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="What is it?">
        <select name="kind" className={inputCls}>
          {KINDS.filter((k) => !k.visa || k.visa === props.visaType).map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="File"
        hint="A PDF, or photos of each page (select them all at once). Lay the page flat in good light, no glare, all four corners in view. Files are deleted after 30 days."
      >
        <input name="file" type="file" multiple required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className={inputCls} />
      </Field>
      <Button disabled={busy}>{busy ? "Uploading…" : "Upload and read"}</Button>
      {error && <p role="alert" className="text-sm text-refused">{error}</p>}
    </form>
  );
}
