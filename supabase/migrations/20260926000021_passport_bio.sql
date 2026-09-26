-- The passport bio page (name, date of birth, nationality, expiry), separate from the pages with
-- visas and stamps. Only the last 4 characters of the passport number are kept (cases.passport_last4).
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check check (kind in (
  'ds160', 'i20', 'ds2019', 'admission_letter', 'scholarship_letter', 'academic_record', 'bank_statement', 'sponsor_letter',
  'employment_letter', 'business_registration', 'property', 'invitation_letter',
  'refusal_letter', 'appointment_confirmation', 'passport_bio', 'passport_travel_page', 'other'
));
