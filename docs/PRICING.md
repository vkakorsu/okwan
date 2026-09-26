# Okwan pricing

**Goal:** the fairest, simplest price for a Ghanaian applicant, with about **70% contribution margin** even in the worst case.

**Status:** credits model adopted 26 Sep 2026 (replacing the date-based Interview Pass), to be validated in Phase 0 (see "How we find the exact number" below). Figures assume **1 USD ≈ GHS 11.5**, the rate in the week of 21–25 Sep 2026 ([Wise](https://wise.com/us/currency-converter/ghs-to-usd-rate/history)).

---

## 1. The principles

1. **Pay for the practice you use.** A pack of interviews and drills, bought once. No subscriptions, no auto-renewals.
2. **Nothing depends on the interview date.** Tying access to a date the user types in rewards lying about it, and every rule to contain that (windows, ceilings, proof uploads, date moves) confused honest users more than it stopped abuse. The date is now only for the countdown.
3. **The worst case is priced in.** Every credit is bounded, so the heaviest possible user (using every credit, every interview running to its time cap) is still profitable. No fair-use small print, no daily caps.
4. **Price against the stakes, not against other apps.**
   - An F-1 applicant pays about **$785 (≈ GHS 9,030)** in government fees:
     - $185 MRV fee
     - $350 SEVIS fee ([SevisGo](https://www.sevisgo.com/sevis-fee))
     - $250 visa integrity fee on issuance, once collection starts ([Manifest Law](https://manifestlaw.com/blog/immigration/news/visa-integrity-fee/))
   - A local consultant charges around **$150 (≈ GHS 1,725)** for a one-hour mock.
   - The main pack should cost well under a week of an average formal salary (roughly GHS 3,500–5,000 a month, [Multiplier](https://www.usemultiplier.com/ghana/average-salary)).
5. **Never price on the outcome.** No "pay only if approved", no "money back if refused": a 214(b) decision is mostly about the case, and outcome pricing would be a hidden approval guarantee.
6. **Show the price upfront in cedis, VAT included, payable by MoMo.**

---

## 2. The price list

All prices include **20% VAT** and can be paid with MTN MoMo, Telecel Cash, AirtelTigo Money or card through Paystack. Defined in code in `src/lib/domain/credits.ts` and `src/lib/pricing.ts`.

| Pack | Price | What you get |
|---|---|---|
| **Free** | GH₵0 | Case Scan and what-to-bring list (no signup), one 90-second interview with a full debrief, 3 drills |
| **Prep** | **GH₵149** | **4 full interviews + 20 drills** |
| **Full Prep** ⭐ | **GH₵299** | **10 full interviews + 60 drills** |
| **Top-up** | GH₵79 | 3 interviews + 15 drills, added to what you have |

- **A full interview is any mode:** real interview, practice mode or dress rehearsal. One credit each.
- **Credits last 6 months** from purchase (183 days). That covers long waits for an Accra appointment. When packs overlap, the credits that expire first are used first.
- **Only a started session uses a credit.** Clicking a mode and leaving costs nothing; the allowance is checked again when the session starts.
- **Why 10 interviews in the main pack:** readiness counts a topic as solid once two different officers heard it answered well. With 4–6 key topics that's roughly 6–10 full interviews, plus drills on the weak answers.
- **Human experts** (Coach, Senior Expert) are shown as coming soon and will be a separate booking once recruited (see [`EXPERTS.md`](EXPERTS.md)). A Family option comes back when joint interviews are built. Group pricing for agencies and schools is by conversation for now.

---

## 3. Trust policies

- **No refunds.** Every account gets a free mock first, so people can judge it before paying. The payment page says so.
- **No auto-renewals, ever.**

### 3a. Abuse, now that there's no date

- **Fake dates:** nothing to gain. The date doesn't unlock anything.
- **One account, one applicant:** the database allows one case per account (migration 16), so credits belong to the account and the person on it. Someone else practising signs up themselves. Sharing a login splits the same credits; it can't create more. The applicant's identity locks after the first paid interview (first name, age ±1, visa type, school and program), one login is active at a time, one live interview at a time per account, and the admin quality page flags accounts used from 3+ network and browser combinations.
- **Free tier:** one free mock and 3 free drills per inbox: name+tag@ and Gmail-dot aliases share them (`profiles.email_canonical`, migration 17). Free sessions need a confirmed email that isn't a throwaway inbox, and all free sessions together are capped at `FREE_SESSIONS_PER_DAY` (default 300) per 24 hours, so a sign-up flood has a fixed daily cost. Cloudflare Turnstile guards sign-up, sign-in and password reset once `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set and CAPTCHA protection is on in Supabase.
- **Cost of a single session:** at most 3 Live tokens (the first plus reconnects), only within the session's own time from its first start; each token lives for the planned length plus 3 minutes. Enforced by the server whatever the browser does (`src/lib/domain/abuse.ts`).
- **Documents:** at most 25 on an account and 40 reads (uploads and re-reads) per 24 hours, counted in `document_reads` so deleting and re-uploading still counts. Storage refuses more than 60 document files or 800 recordings per account.
- **Payments:** the Paystack webhook signature is checked, and every payment is re-verified with Paystack and must match the pack price before credits are granted.

---

## 4. Unit economics (per sale)

VAT is 20% of the net price and goes to GRA. Paystack takes **1.95%**. Model costs are estimates: about **$0.12 per full interview** at its time cap (Live audio, two grading runs, second transcript) and **$0.025 per drill**, at GHS 11.5 per dollar. The worst case assumes every credit is used at its cap.

| Pack | Price | After VAT | Paystack | Worst-case model cost | **Contribution** | Margin on price |
|---|---|---|---|---|---|---|
| Prep | 149 | 124.2 | 2.9 | ~11 | **~110** | 74% |
| Full Prep | 299 | 249.2 | 5.8 | ~31 | **~212** | 71% |
| Top-up | 79 | 65.8 | 1.5 | ~8.5 | **~56** | 71% |

- A realistic user costs far less than the worst case: few people use every credit.
- **Customer acquisition cost:** keep blended CAC under about **GHS 100** (half the Full Prep contribution), mostly from referrals and the free Case Scan.

---

## 5. Honest market sizing (so we price for the right scale)

- **The embassy in Accra processed about 61,000 visa applications in 2024** ([AllAfrica](https://allafrica.com/stories/202505140274.html)).
- At **5% paid penetration** with a blended price of about GHS 250, that's **roughly GHS 760k (≈ $66k) a year**.
- **So Ghana alone is a good business, but not a big one.** Pricing here should maximise *penetration and word of mouth*, not squeeze every cedi. The big numbers come from:
  1. **Institutional seats.** Agencies send hundreds of students a year.
  2. **Expanding across West Africa** with the same engine: Nigeria first, which has a much larger applicant volume.
  3. **More visa types**, and household repeat purchases (a sibling next year, parents visiting the student).
  4. **Adjacent add-ons after approval:** a pre-departure and port-of-entry (CBP) questioning drill, and SEVIS or school-transfer questions later on.

---

## 6. How we find the exact number (don't guess, measure)

1. **Phase 0:** run a **Van Westendorp price survey** plus a Gabor-Granger purchase-intent question with 150–300 recent and upcoming applicants, found through TikTok, campus groups and agencies. Split the results by F-1 and B1/B2.
3. **Test prices by time period, not by random split.** Run Full Prep at GHS 249, 299 and 349 in consecutive 2-week windows, and compare conversion and revenue per visitor. In Ghana, prices get screenshotted and shared on WhatsApp; if two friends see different prices on the same day, trust is gone.
4. **Revisit every quarter.** Revenue is in cedis and costs are in dollars:
   - The cedi can move sharply, as it did in 2022.
   - Gemini TTS prices double on 1 Jan 2027.
   - Reprice when contribution drops below 65%. Announce changes a month ahead and honour credits already bought.

---

## 7. Compliance and checkout details

- **Register for VAT from day one.** Under the new VAT Act 2025 (Act 1151), effective 1 Jan 2026, the GHS 750,000 threshold applies only to *goods*. Suppliers of services must register whatever their turnover ([Crowe Ghana](https://www.crowe.com/gh/news/ghana-vat-reform-2026), [High Street Journal](https://thehighstreetjournal.com/gra-clarifies-vat-registration-thresholds-and-flat-rate-transition-under-act-1151/)). The effective rate is 20% (15% VAT plus 2.5% NHIL plus 2.5% GETFund; the COVID levy has been abolished) ([VATupdate](https://www.vatupdate.com/2026/01/07/ghana-revises-effective-vat-rate-to-20-from-january-2026-key-changes-announced/)).
  - **Issue E-VAT invoices** as GRA's 2026 rollout requires ([Fonoa](https://www.fonoa.com/resources/blog/ghana-e-vat-e-invoicing-2026)).
  - **Confirm the details with a Ghanaian tax adviser.**
- **Checkout:**
  - Paystack's MoMo checkout with a phone-number prompt. Default the network to the one the user signed up with.
  - Take card payments for diaspora gifts.
  - Settle to a MoMo wallet or a bank account.
- **Receipts** go by WhatsApp and email, showing VAT separately.
- **Price display:** `GH₵349` with the VAT-inclusive note in small text. **Never show a "per day" framing.** It sounds cheap, but it pushes people to rush.

---

## Sources
- Wise, GHS→USD history: https://wise.com/us/currency-converter/ghs-to-usd-rate/history
- Paystack Ghana pricing: https://paystack.com/gh/pricing
- Permito pricing (via its roundup): https://permito.ai/blog/best-ai-mock-interview-tools-visa-2026
- SEVIS fee: https://www.sevisgo.com/sevis-fee
- Visa integrity fee: https://manifestlaw.com/blog/immigration/news/visa-integrity-fee/
- Accra 2024 application figures: https://allafrica.com/stories/202505140274.html
- Crowe Ghana, VAT reform 2026: https://www.crowe.com/gh/news/ghana-vat-reform-2026
- High Street Journal, VAT thresholds: https://thehighstreetjournal.com/gra-clarifies-vat-registration-thresholds-and-flat-rate-transition-under-act-1151/
- VATupdate, 20% effective rate: https://www.vatupdate.com/2026/01/07/ghana-revises-effective-vat-rate-to-20-from-january-2026-key-changes-announced/
- Fonoa, Ghana E-VAT: https://www.fonoa.com/resources/blog/ghana-e-vat-e-invoicing-2026
- Minimum wage and salary context: https://www.usemultiplier.com/ghana/average-salary
