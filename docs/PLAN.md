# Okwan: product, engineering, design and SEO plan

**What it is:** an interview simulator for Ghanaians applying for US visas. You upload your documents, then you practise with a simulated consular officer who has "read your DS-160" and questions you the way it happens at the window in Accra. After each session you get an honest debrief.

**Status:** research and decision document, written 25 Sep 2026. Every figure below has its source linked in the [Sources](#sources) section. Where a source is a weak blog rather than a primary source, this document says so.

**Revision 2 (25 Sep 2026):**
- **§2.2 is a new design for the interview engine.** Each session is generated per user and per session: a Director (with memory) plans it, an Officer (without memory) runs it, and a Referee decides the outcome. There's a probe taxonomy, rules for novelty and weak-area retests, and a way to measure realism.
- **§4 security:** added prompt-injection hardening for uploaded documents.
- **§4.3:** added a warning about the LiveKit + Gemini 3.8 Live plugin.
- **§4.4:** added data tables for session plans and question memory.
- **§2.3:** added feedback on the first 60 seconds and on volunteered information.
- **Phase 0 (§10):** now collects real transcripts to calibrate realism.
- **§11:** new risks added.

---

## 0. TL;DR (the decisions)

| Area | Decision |
|---|---|
| **Name** | **Okwan** (Twi for *the way / the road*). `okwan.ai` is the primary domain. `okwan.app` and `getokwan.com` redirect to it. All three were available on 25 Sep 2026. See §9. |
| **Core bet** | Don't build a question-bank chatbot. Build the **2.5-minute interview itself**, and **never the same one twice**. A Director with memory of every earlier session plans each interview around *your* case and *your* weak spots. Then a fresh Officer, who knows only what a real officer would see, runs it, improvises follow-ups from your answers, and is decided by a rules-based Referee (§2.2). The debrief is grounded in your own documents. |
| **Wedge** | Start with F-1 (81% refusal rate for Ghana in 2025) and B1/B2 (64.3% refusal rate). Add J-1, then others. |
| **Live officer voice** | **Gemini 3.8 Live**, a native speech-to-speech model: about 1.2 s to first audio, built-in barge-in, about $0.02–0.03 of audio per minute. |
| **Gemini 3.8 Flash TTS** | **Relevant, but not for the live conversation.** It takes about 13 s to first token. Use it for pre-rendered officer audio: the drill library, offline practice, "hear a strong answer", and marketing demos. See §3. |
| **Transcripts and delivery analysis** | **Gemini 3.5 Transcribe** runs after the interview. It gives word timestamps for pause and pace analysis. Users can correct their transcript, because West-African-accented ASR is still error-prone. |
| **Stack** | Next.js 16 on Vercel, Supabase (Postgres, RLS, Storage, Auth), LiveKit Cloud (WebRTC/Opus) with a Gemini Live agent worker, Inngest for jobs, Paystack for Mobile Money, and PostHog plus Sentry. |
| **Pricing** | Packs of interview and drill credits, paid once with MoMo: **Prep GHS 149** (4 interviews, 20 drills), **Full Prep GHS 299** (10 interviews, 60 drills), **Top-up GHS 79**, usable for 6 months. A free tier. Nothing depends on the interview date. No subscriptions and no outcome-based pricing. About 70% margin in the worst case. See [`PRICING.md`](PRICING.md). |
| **Trust rule** | We never promise approval, never write fake answers, and never imply US government affiliation. Real results come from rehearsing *your own true case* until you can say it clearly in 20 seconds. |
| **Design** | One idea runs through the whole brand: **the window**. The look is editorial, cinematic and warm, with Ghanaian photography from a commissioned shoot, one signature interaction, and a performance budget that still passes Core Web Vitals on a mid-range Android on MTN 4G. |
| **SEO/GEO** | First-party data is the moat: a live Accra wait-time tracker, a database of reported questions, and guides reviewed by former consular officers. Pages open with direct answers and use structured data and strong entity signals. Treat `llms.txt` as optional; Google doesn't use it. |

---

## 1. The market reality (why this can work, and what "results" must mean)

**The pain is severe and measurable:**

- **F-1 refusals in Ghana hit a record 81% in 2025**, up from 72% in 2024. Meanwhile, Ghanaian enrolment in the US grew 36.5% to 12,825 students in 2024/25. Demand is high and success is rare. ([ICEF Monitor](https://monitor.icef.com/2026/04/visa-rejections-climb-in-the-us-for-international-students-from-key-markets-including-india/), [Yen.com.gh](https://yen.com.gh/people/302892-us-releases-list-countries-highest-student-visa-refusal-rates-ghana-unenviable-score/))
- **The B1/B2 refusal rate for Ghana was 64.3% in FY2025**, against a 27.8% global average. ([Alma](https://www.tryalma.com/learn/visa-denial-rate-statistics)) This is a secondary aggregator, so check it against State Dept 214(b) tables before quoting it in marketing.
- **Visa bond: Ghana is *not* on the list** (corrected 26 Sep 2026). The B1/B2 bond programme became permanent on 3 Aug 2026 at $10k, $15k or $20k, for 50 designated countries, including Nigeria, Togo and Benin, but not Ghana. Monitor the list, because designations are added on a rolling basis with 15 days' notice. An earlier draft of this plan wrongly said Ghana was included, based on secondary news reports. ([State Dept, Mar 2026](https://www.state.gov/releases/office-of-the-spokesperson/2026/03/state-department-expands-visa-bonds-to-combat-illegal-overstay-rates), [Federal Register final rule](https://www.federalregister.gov/documents/2026/08/03/2026-15726/visas-visa-bond-program), [BAL](https://www.bal.com/immigration-news/united-states-state-department-finalizes-permanent-visa-bond-program-for-certain-b-1-b-2-applicants/))
- **Social-media vetting:** student applicants must set their accounts to public before the interview. ([GhanaWeb](https://www.ghanaweb.com/GhanaHomePage/business/Why-the-US-Embassy-requires-access-to-social-media-for-student-visa-applications-1988975))
- **Five-year multiple-entry visas were restored for Ghana on 26 Sep 2025**, after the July 2025 single-entry restriction was lifted. A good outcome is worth more again. ([Ghana MFA](https://mfa.gov.gh/index.php/reversal-of-u-s-visa-restrictions-on-ghana/), [ISD](https://isd.gov.gh/us-lifts-visa-restrictions-on-ghana-restores-5-year-multiple-entry-visas/))
- **Fees:** the $185 MRV fee is non-refundable, and the new $250 "visa integrity fee" is being rolled out on issuance. A refusal costs real money, which anchors our pricing. ([Manifest Law](https://manifestlaw.com/blog/immigration/news/visa-integrity-fee/), [BU ISSO](https://www.bu.edu/isso/2026/05/19/visa-integrity-fee/))
- **Appointment scarcity:** the embassy released about 1,000 extra B1/B2 slots in Feb 2026 because demand was so high. ([The Voice of Africa](https://thevoiceofafrica.com/2026/02/18/u-s-embassy-in-ghana-opens-1000-new-visa-interview-slots-amid-high-demand/))

**How the interview actually works:**

- Officers get **about 2.5 minutes per applicant**. ([Kuck Baxter](https://immigration.net/2026/08/10/why-your-visa-interview-is-only-2-5-minutes-long/), [Boundless](https://www.boundless.com/immigration-resources/preparing-for-travel-visa-interview))
- The **DS-160 is always reviewed**. Supporting documents are often **not looked at**. ([Boundless](https://www.boundless.com/immigration-resources/form-ds-160-explained))
- Most refusals are **INA 214(b)**: the applicant failed to overcome the presumption of immigrant intent. A 214(b) refusal can't be appealed. Only a materially stronger case changes the outcome on reapplication.

**What this means for the product:**

1. Documents matter mainly because **your spoken answers must match your DS-160 and your paperwork**, and because they show *where the officer will probe*. The uploaded documents feed the simulator. We don't build a document-review service.
2. The skill we train is **saying a true, strong case in 1–3 sentences, under pressure, in about 2.5 minutes**. Long answers, memorised scripts, hesitation and inconsistency are what get applicants refused.
3. **"Real results, not snake oil"** means:
   - never predict approval
   - never generate fabricated answers
   - be honest when a case is weak ("your funding doesn't cover year 1 on the I-20; practising won't fix that")
   - measure outcomes transparently (see §7)

   Coaching someone to misrepresent facts exposes them to a **permanent misrepresentation bar**, INA 212(a)(6)(C)(i). The product has to protect users from that.

**Competitors:** VisaInterview.ai, MockVisa, Permito, Visavi, YMGrad and Matherium ([Permito's roundup](https://permito.ai/blog/best-ai-mock-interview-tools-visa-2026), [VisaInterview roundup](https://www.visainterview.ai/blog/best-ai-visa-interview-prep-tools-2026)). They are all generic, India-first, F-1 question banks with text or voice feedback. **None of them is built around a Ghanaian applicant's actual documents, the Accra post, or cedi pricing with MoMo.** Local human consultants charge around $150 for an hour-long mock ([Gumroad example](https://globalvisashelp.gumroad.com/l/StudentVisaDeepDiveDocumentsInterviewPrep)), and quality varies a lot. That gap is the opening.

---

## 2. Product: the features that do the job

The product has four parts: **Case, Window, Debrief and Readiness.** Each one exists because of a fact in §1.

### 2.1 Case File (upload → structured case)
- The user uploads their documents:
  - DS-160 confirmation or answers
  - I-20 or DS-2019, and the admission letter
  - bank statements and the sponsor letter
  - employment letter or business registration
  - property and family ties
  - invitation letter (B1/B2)
  - prior refusal letters
  - the travel history page from the passport
- Gemini 3.8 Flash (multimodal, structured output) extracts a **Case Profile** into a Zod-validated schema: purpose, program, cost vs. funds, sponsor and relationship, ties, travel history and prior refusals.
- The user confirms or corrects every extracted field. **This confirmed profile is the only source of truth** that later coaching may use.
- **Case Scan** (free, and the lead magnet) lists the questions the officer is most likely to press on. It never gives an approval probability. Examples:
  - **Funding gap:** I-20 year-1 cost is more than the documented liquid funds.
  - **Large recent deposit:** a lump sum was deposited shortly before the application.
  - **Unclear sponsor:** the sponsor's relationship or income isn't clear.
  - **Program doesn't fit the career:** e.g. a mid-career banker going to a generic MBA with no plan to return.
  - **DS-160 mismatch:** the documents contradict the DS-160 (dates, employer, address).
  - **Visitor-visa costs:** the $250 visa integrity fee (and the bond, only if Ghana is ever added to the bond list).
  - **Social-media vetting:** a reminder to set accounts to public (F/M/J).
  - **Prior refusal with nothing changed:** a 214(b) refusal and no new evidence since.

### 2.2 The Window: no two interviews alike (this is the product)

Real interviews are never scripted. Two applicants with the same visa type get different questions, because the officer reacts to *their* DS-160 and to *their* last sentence. The same applicant would get a different interview on a different day, with a different officer. Most competitors' products don't work like this: they draw from a fixed question list and apply the same rubric to everyone. **Okwan's officer is generated fresh for every user and every session, and it is constrained by reality.**

#### 2.2.1 How the real interview behaves (what we must reproduce)
- **The officer's first read of you comes from the DS-160 and from SEVIS (for F/J).** They can also see prior real refusals and travel history in the consular database. Nothing else.
- **Most officers form a view in the first minute or so.** Some interviews end after 2 questions; some go 6–8 questions deep ([VisaMet](https://visamet.com/guides/us-visa-interview-questions-2026-guide), [EduConnect USA](https://educonnectusa.com/2026/05/f1-visa-interview-questions-2026/)).
- **Volunteering information opens new lines of questioning.** If you mention "my sister in Houston", the next question is about your sister ([NNU Immigration](https://www.nnuimmigration.com/us-visa-interview-questions/)).
- **Inconsistency between the DS-160 and what you say** is one of the most common refusal triggers ([Botelho Law](https://botelholawgroup.com/consular-processing-interview-questions-2026-guide/)).
- **Officers are individuals.** They vary in pace, warmth, scepticism and patience. Sometimes there is silence while they type. Sometimes they ask you to repeat yourself, or ask for one document.
- **Scale in Accra:** 61,000 applications in 2024, of which about 25,000 were approved ([AllAfrica / US Embassy](https://allafrica.com/stories/202505140274.html)).

#### 2.2.2 Two brains: a Director plans, an Officer performs
Each session is produced by two models with **deliberately different knowledge**:

| | **Director** (plans the session, text model) | **Officer** (runs the session, Gemini 3.8 Live) |
|---|---|---|
| Knows | The confirmed Case Profile, the Case Scan, **every earlier session** (answers, weak spots, contradictions, questions already asked), days until the interview, and aggregated Reported Questions for similar profiles | **Only what a real officer would see:** DS-160 facts, I-20/DS-2019 (SEVIS), declared *real* prior refusals, travel history. **Nothing from earlier mocks.** |
| Produces | A **Session Plan** (below), generated while the user sits in a short "waiting room" (queue number, ambience). That wait also hides the 2–4 s it takes to generate the plan. | The live interview: it improvises follow-ups from what the user actually says, within the plan's guardrails |
| Why | Coaching needs memory, so the Director targets what you're weak at | Realism needs amnesia: every mock is a *new officer*, as it would be on the day |

#### 2.2.3 The Session Plan (generated per user, per session)
A JSON object validated with a Zod schema. It contains:
- **The officer.** Sampled from *continuous* traits rather than 4 fixed personas: pace, warmth, scepticism, patience, verbosity, how much they interrupt, and how long they stay silent. Also a name plate, and a US voice or regional accent chosen from the Live voices. Across a user's sessions, officers are drawn to be *different from the recent ones*.
- **Probes (2–4).** A probe is a hypothesis the officer tests, e.g. "funding covers year 1?", "reason to return?", "program fits career?", "who is the sponsor, really?". Each probe carries:
  - **The facts it's grounded in:** exact profile fields.
  - **Several entry phrasings.** The officer picks one or improvises.
  - **An escalation ladder:** follow-ups if the answer is vague, and different ones if it's contradictory.
  - **What a satisfying answer must contain**, in facts rather than wording.
  - **An exit condition:** when the officer moves on.
- **The opening move.** Examples: "Why this school?", "Who's paying?", "What do you do?", or a document request.
- **Tempo and length.** A target duration sampled from **60 s to 4 min**, and an early-decision threshold. Strong answers can end the interview after 2 questions, just as in real life.
- **Realism events, 0–2 per session, drawn from a curated list:**
  - the officer asks you to repeat
  - a long typing silence
  - "Do you have your I-20 / bank statement?"
  - an interruption mid-answer
  - a follow-up on something you volunteered
  - a DS-160 cross-check ("You didn't list relatives in the US...")
- **A "wildcard" probe (at most one), drawn only from the taxonomy.** Example: "Why not study in Ghana?", or a question about a detail in your case you haven't practised.
- **A decision policy:** the rules for approved, 221(g) and 214(b) in terms of probe results (see 2.2.5).

#### 2.2.4 How the Director picks what to test (the tailoring rules)
1. **Taxonomy-bounded.** The Director chooses probes only from a curated **probe taxonomy**: intent, ties, funding, sponsor, academic fit, career logic, travel history, US contacts, prior refusal, and so on. The taxonomy is built with former-officer advisors and fed by Reported Questions. Phrasing is generated; *what is tested* is not invented. This is what separates real variety from strange LLM questions.
2. **Weakness-weighted.** A probe the user struggled with comes back in a later session, **with a different officer and different phrasing** (spaced repetition). A weakness is fixed only once it has been handled well by ≥2 distinct officers.
3. **Novelty-constrained.** Questions are embedded and stored. A plan is rejected and regenerated if too many of its questions are near-duplicates of the last 3 sessions. The exception is deliberate weak-area retests.
4. **Coverage.** Before the Readiness score can go green, every probe that is relevant to *this* case must have been tested at least once.
5. **Difficulty rises with readiness.** Officers get terser and more sceptical as the user improves. The last session before the interview date is a **dress rehearsal**: realistic tempo, no hints, a length drawn from the real distribution.
6. **The case changes, and the officer follows.** If the user uploads a new bank statement or changes a DS-160 answer, the profile is re-versioned, the Case Scan re-runs, and the next officer sees the new facts.
7. **Not every session is hard.** Some officers approve quickly when answers are strong. Users must learn that short and confident is enough, and that they shouldn't keep talking after "approved".

#### 2.2.5 In-session state: the Referee
- The Officer calls **non-blocking tools** as it goes. Non-blocking is the default in 3.8 Live, so the conversation doesn't pause ([Google Cloud: async function calling](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/asynchronous-function-calling)). The tools are:
  - `log_probe(probe_id, answer_quality, facts_mentioned)`
  - `log_volunteered(fact)`
  - `log_inconsistency(field, said, on_file)`
  - `propose_decision(outcome, reasons)`
- **The Referee** is server-side code in the agent worker. It keeps the probe state and the time budget. It checks what the user says against the profile to catch contradictions deterministically. **It decides the outcome from the decision policy.** The Officer's `propose_decision` is one input to that decision, not the verdict. This keeps outcomes consistent and explainable, instead of depending on the model's mood.
- The Referee can nudge the Officer mid-session through context injection, for example: "time's up, decide", or "they just contradicted the DS-160 sponsor field, ask about it".
- **Grounding guard:** the Officer may only state facts from its officer file. If it asserts something that isn't on file (e.g. "you said you're going to Texas" when it's Ohio), the Referee flags it, and it counts against our model quality metrics (target: 0).

#### 2.2.6 The room
- **Presentation:**
  - The interview is full-screen and minimal.
  - The officer's voice comes "through the glass", with a light room tone and queue ambience you can switch off.
  - The applicant stands. We prompt this, because posture changes how people speak.
- **Modes:**
  - **Real mode** has no pause button and no hints.
  - **Practice mode** lets you pause, get a hint and retry a single question.
- **Endings:**
  - "Your visa is approved" (the officer keeps the passport)
  - a 221(g) slip
  - a 214(b) refusal sheet

  The debrief explains why, using the Referee's probe log. Every outcome is labelled **a training signal, not a prediction**.
- **Full-visit mode (optional):** the arrival and wait sequence before the window. Build it only after Phase 0 interviews with recent Accra applicants confirm the actual sequence. Don't guess.
- **Visa types at launch:** F-1 and B1/B2. Later: J-1, then H-1B/L-1 and K-1, and DV immigrant-visa interviews (DV interviews are a different format, so they're a separate module).
- **Camera is optional.** With consent, 1 fps frames give feedback on eye contact and composure. Audio plus video Live sessions are capped at 2 min unless context compression is on. We turn compression on, but audio-only is the default so the experience is lighter on data.

#### 2.2.7 How we prove sessions aren't cookie-cutter
- **Blind realism test.** Every quarter, advisors get a mix of real interview transcripts (collected with consent in Phase 0) and simulated ones, and try to tell them apart. The target is performance close to chance.
- **Per-session metrics:**
  - the novelty rate (share of questions not asked in the user's last 3 sessions)
  - probe coverage
  - how often weak areas are retested
  - grounding errors
  - the user's own rating: "Did this feel like the real thing?" (1–5)
- **Minimum bar:** two users with the same visa type and different cases should share fewer than about 30% of their opening probes. The same user should never get the same session twice.

### 2.3 Debrief (feedback you can act on)
Each answer gets:
- **What the officer was really testing:** intent, ties, funding, purpose or credibility.
- **Scores for:**
  - directness (did the first sentence answer the question?)
  - specificity (names, numbers, dates)
  - consistency with your Case Profile and earlier answers
  - length (seconds and words; aim for under about 20 s)
  - delivery: fillers, long pauses and pace, taken from word timestamps
- **Your first 60 seconds.** A separate grade for the opening exchange, because officers often decide early.
- **Volunteered information.** The debrief shows where you offered extra facts that opened a new line of questioning, and whether that helped or hurt.
- **Red-flag detection.** Examples: "I'll look for a job there", "My uncle will pay" (with no documented uncle), "I'm not sure yet".
- **"Your answer, stronger":** a rewrite that may use **only facts from your confirmed profile**. If the true case is weak, the rewrite says what evidence is missing and doesn't invent it. A validator enforces this. It blocks any rewrite that adds entities, numbers or relationships that aren't in the profile.
- **Replay:** your recording plays alongside the transcript. You can re-record just that answer (a spaced-repetition drill).

### 2.4 Readiness (progress that is honest)
- **The Readiness score** covers the last N Real-mode sessions, with **at least 3 distinct officers, one of them in the upper third for scepticism**. Every relevant probe must be covered (§2.2.4), and consistency counts over time. It is designed to be hard to game: repeating easy sessions doesn't raise it.
- **The Consistency tracker** flags contradictions across sessions. Example: the sponsor was "father" on Tuesday and "uncle" on Thursday. In the real interview, this kind of contradiction is fatal.
- **Countdown plan:** the user enters an interview date and gets a short daily plan, e.g. "3 min a day, 1 full mock every 2 days, a dress rehearsal 48 h before".
- **Day-of guide for the Accra embassy:** logistics, what to bring, timing and composure. It links to the official pages and doesn't replace them.

### 2.5 Things that make Ghanaians choose it (and tell friends)
- **Priced in cedis and paid with MoMo** (MTN MoMo, Telecel Cash, AirtelTigo Money) through Paystack. Mobile money dominates payments in Ghana. ([Paystack by country](https://www.mctaba.com/learn/paystack/paystack-by-country-nigeria-ghana-south-africa-kenya-rwanda-cote-d-ivoire))
- **Low-data mode.** It is audio-only, uses Opus over WebRTC (§4.3), and shows the expected data cost before a session. Drills can be downloaded and practised offline, using the pre-rendered TTS audio.
- **WhatsApp companion** (phase 2): a daily "officer question" as a voice note, answered by voice note and graded. WhatsApp is how Ghana communicates.
- **Parents mode (B1/B2):** a lot of B1/B2 applicants are parents visiting children abroad. Offer a bigger type size, a slower-paced officer, and a helper can set it up for them. Twi/Ga/Ewe explanations appear in the debrief only; the interview itself stays in English, as at the window.
- **The share moment:** after an approval, the user can share an optional "Approved ✅" card to their WhatsApp Status. In Ghana, approval news spreads fast; this makes it a referral. Referral credit is paid in MoMo.
- **Refused before? track:** covers what a 214(b) refusal means, what has *materially* changed, and whether reapplying now makes sense. Sometimes the honest answer is "wait". That honesty builds trust.

### 2.6 Explicitly **not** doing
- Approval-probability percentages
- "Guaranteed visa" claims
- Answer scripts to memorise
- Anything that fills in or edits the DS-160 for the user (that's legal-practice and misrepresentation territory)
- US-government seals, flags as a trust device, or "embassy" in the brand name

---

## 3. Gemini 3.8 Flash TTS: is it relevant?

**Yes, as a supporting model. It is the wrong tool for the live officer.**

**What it is:**
- It was released in September 2026, together with **3.8 Flash-Lite TTS**, in the Gemini API and AI Studio.
- It ranks #1 on Hume AI's Overall Quality Index. Flash-Lite is #2.
- **2,000+ voices**, and voice design from a text prompt
- **Inline audio tags:** emotion, pace and accent can be set sentence by sentence
- **Native two-speaker scenes**
- **130 languages**
- **Voice cloning from 30 s of audio**, gated by a spoken consent clip from the same speaker
- **SynthID watermark and C2PA credentials**

**Cost:** $0.50/M text-input tokens and **$9.00/M audio-output tokens**, about **$0.81 per hour of audio**. Both rates **double on 1 Jan 2027**. Flash-Lite charges $6.00/M for audio output. The catch is **time to first token of about 13.3 s**, against a median of about 3 s. Sources: [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-text-to-speech/), [tbreak](https://tbreak.com/gemini-3-8-flash-tts-voice-cloning/), [The Next Web](https://thenextweb.com/news/gemini-tts-3-8-flash-voice-design-cloning), [eesel pricing](https://www.eesel.ai/blog/gemini-3-8-flash-tts-pricing), [Artificial Analysis](https://artificialanalysis.ai/models/releases/gemini-3-8-flash).

A 13 s silence before every officer question would ruin the simulation. For the real-time conversation, use **Gemini 3.8 Live** instead:
- 1.18 s to first audio
- barge-in built in
- background tool calls
- 16 kHz PCM in, 24 kHz PCM out
- $3/M audio-in tokens (≈ $0.005/min) and $12/M audio-out tokens (≈ $0.018/min)
- audio-only sessions capped at 15 min without compression

A 4-minute mock costs **well under $0.15** in model audio. Sources: [SiliconANGLE](https://siliconangle.com/2026/09/15/googles-new-speech-model-gemini-3-8-live-supports-real-time-reasoning/), [MarkTechPost](https://www.marktechpost.com/2026/09/15/google-releases-gemini-3-8-live-and-3-8-live-extended-thinking-for-production-grade-voice-agents/), [Developers Digest](https://www.developersdigest.tech/blog/gemini-3-8-live-extended-thinking-release-guide-2026), [Google Cloud guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live).

**Where 3.8 Flash TTS earns its place:**
1. **The drill library.** Thousands of officer questions are pre-rendered once, in several personas, with audio tags such as `[flat, brisk]` or `[slight pause]`, then cached in storage or a CDN. Drills start instantly, work offline, and cost almost nothing per play.
2. **"Hear it said well."** A strong answer, built only from the user's own facts, is read back so they can copy the delivery (shadowing). There is an optional experiment: the same answer **in the user's own cloned voice**, which requires their spoken consent through Google's consent check. Hearing yourself sound confident is a known confidence-builder. Keep it opt-in and delete the voice on request.
3. **Two-speaker example interviews** for SEO and marketing pages, clearly labelled as simulated: officer and applicant, with a good and a bad version. This content is very shareable on TikTok and YouTube Shorts.
4. **Onboarding and day-of-guide narration** for parents mode and for users with low literacy.

**Use Flash-Lite TTS** for bulk renders (the drill library) and **Flash TTS** for the hero and demo content. **Never** clone the voice of a real officer or a public figure.

**Model split:**

| Job | Model |
|---|---|
| Live officer | Gemini 3.8 Live. Use 3.8 Live Extended Thinking only for a "hard mode" persona, if its latency holds up. |
| Pre-rendered speech | 3.8 Flash TTS and Flash-Lite TTS |
| Post-session transcript, word timestamps, diarisation | Gemini 3.5 Transcribe: about $0.005/audio-min, 2.6% WER non-streaming on AA English ([eesel](https://www.eesel.ai/blog/gemini-3-5-transcribe), [OpenRouter](https://openrouter.ai/google/gemini-3.5-transcribe)) |
| **Director** (session plans), document extraction, debrief grading, rewrites | Gemini 3.8 Flash with structured output |
| Referee (outcome and consistency checks) | Mostly deterministic code in the agent worker. A small Flash call is used only to judge fuzzy fact matching. |

Keeping one vendor keeps it to one DPA and one bill, with low latency between the models. Optional: run a second model family as an offline judge to calibrate grading drift.

> **Accent risk.** Benchmarks put **West-African-accented English at about 30% mean WER** across ASR systems ([AfriSpeech-MultiBench](https://arxiv.org/abs/2511.14255)), far worse than the 2–3% on standard corpora.
>
> **Mitigations:**
> - Gemini Live works on the audio directly, so it is more accent-robust than a speech-to-text-then-LLM pipeline.
> - Users can correct their transcript before it's graded.
> - Delivery is never scored on words the ASR probably got wrong.
> - From day one, build an **internal Ghanaian-English eval set**, sourced with consent, and gate every model upgrade on it.

---

## 4. Engineering

### 4.1 Architecture

```mermaid
flowchart LR
  subgraph Client["Browser (Next.js 16 PWA)"]
    UI[Marketing + App UI]
    Room[Interview Room<br/>LiveKit client, Opus/WebRTC]
  end
  subgraph Vercel
    RSC[Next.js RSC / Route Handlers]
  end
  subgraph Agents["LiveKit Cloud + Agent worker (EU region)"]
    Agent[Officer agent + Referee<br/>Gemini 3.8 Live plugin]
  end
  subgraph Google["Gemini API / Vertex AI"]
    Live[Gemini 3.8 Live]
    Flash[Gemini 3.8 Flash]
    TTS[3.8 Flash / Flash-Lite TTS]
    STT[3.5 Transcribe]
  end
  subgraph Data["Supabase (EU)"]
    PG[(Postgres + RLS)]
    S3[(Storage: docs, recordings)]
    Auth[Auth: phone OTP + Google]
  end
  Jobs[Inngest jobs]
  Pay[Paystack MoMo]

  UI --> RSC --> PG
  Room <--> Agent <--> Live
  Agent --> S3
  RSC --> Jobs
  Jobs --> Flash & STT & TTS
  RSC -- Director: session plan --> Flash
  RSC -- plan --> Agent
  Jobs --> PG
  RSC --> Pay
```

### 4.2 Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Web framework | **Next.js 16** (App Router, **Cache Components / PPR**, Turbopack, React Compiler), TypeScript | Marketing pages are static and edge-cached, which is what SEO needs, while the app shell is dynamic. One codebase. ([Next.js 16](https://nextjs.org/blog/next-16)) |
| Hosting | **Vercel** | Edge CDN close to West Africa via EU PoPs, preview deploys, Speed Insights for real-user CWV. |
| Styling / motion | Tailwind CSS v4, Motion, CSS scroll-driven animations, View Transitions API | The award-level motion lives in CSS and on the compositor so INP stays low (§5, §6). |
| Realtime | **LiveKit Cloud + LiveKit Agents (Gemini Live plugin)** | See §4.3. ([LiveKit Gemini plugin](https://docs.livekit.io/agents/models/realtime/plugins/gemini/)) |
| DB / Auth / Storage | **Supabase** (Postgres, Row-Level Security, Storage, Auth with phone OTP and Google) | Sensitive documents sit behind RLS. One vendor for three needs. Use an EU region (lowest latency to Accra over the submarine cables). |
| Jobs | **Inngest** | Durable multi-step pipelines: extract → validate → Case Scan, and transcribe → grade → rewrite → validate. |
| Payments | **Paystack** | Covers MoMo (MTN, Telecel, AirtelTigo) and cards, and settles in GHS. |
| Observability | **PostHog** (product analytics, flags, session replay with PII masking), **Sentry**, Vercel Speed Insights | |
| Email / WhatsApp | Resend for email. WhatsApp Cloud API in phase 2. | |
| Validation | Zod schemas are shared between LLM structured output, APIs and the DB | One schema per concept, so LLM output can't drift. |
| Testing | Vitest, Playwright (a sandboxed Chromium is available), and an **LLM eval suite** (golden cases, a Ghanaian-accent audio set, and grading-consistency checks) in CI | "Real results" starts with measured model behaviour. |

### 4.3 Why LiveKit (WebRTC) rather than a raw browser → Gemini WebSocket
- Gemini Live expects **16-bit PCM at 16 kHz in and 24 kHz out**. That's roughly **2 MB/min up and 3 MB/min down**, or about 20 MB for a 4-minute mock, and it runs over TCP, which stalls on lossy mobile links.
- **WebRTC with Opus** uses roughly 24–32 kbps each way (about 0.2–0.25 MB/min). It handles jitter and packet loss, and it has echo cancellation and noise suppression built in. For users on MTN or Telecel 4G, that difference *is* the product.
- The agent worker runs next to Google. It converts Opus to PCM, keeps the system prompt and the Case Profile **server-side** (they are never exposed to the browser), records both tracks for the debrief, and enforces session limits.
- **Plugin warning (as of Sep 2026):** Gemini 3.8 Live makes tool calls asynchronous by default. There is an open LiveKit Agents issue saying the plugin ends up in a hybrid blocking/non-blocking state, that scheduling can't be set per tool, and that tool results wait until audio playback finishes ([livekit/agents#7302](https://github.com/livekit/agents/issues/7302)). The Referee depends on those tools, so **spike this in Phase 0**. If it's still broken, use our own thin LiveKit agent that talks to the Live API directly, or the fallback below.
- **Fallback:** the Gemini Live WebSocket connected directly from the browser, using **ephemeral tokens locked to the config**. This is useful for a prototype in week 1. ([Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [session management](https://ai.google.dev/gemini-api/docs/live-session))
- Turn on **session resumption**, so a dropped connection resumes within 24 h, and **context-window compression**, so sessions aren't capped at 15 min.
- **Measure from Accra** before choosing regions. Candidates are europe-west for Gemini and Vertex, and the EU for LiveKit and Supabase. Budget: under 1.5 s from the end of the user's speech to the officer's first audio, at the 75th percentile, on 4G.

### 4.4 Data model (core tables)
- `profiles`: user, phone, locale
- `cases`: visa type, interview date, confirmed profile JSON, version
- `documents`: storage path, type, extraction JSON, `delete_after`
- `sessions`: case, profile version, mode, outcome, duration, recording paths
- `session_plans`: the Director's JSON plan (officer traits, probes, events, decision policy), the model version, and the random seed. Keeping these makes any session reproducible for debugging.
- `probe_taxonomy`: curated probes with visa types, entry phrasings, escalation ladders and required facts. Advisors own it, and it's versioned.
- `probe_results`: the Referee's log per probe (quality, facts mentioned, inconsistencies). This feeds weak-area retests.
- `asked_questions`: the text and a **pgvector** embedding of each question, used by the novelty check
- `turns`: session, officer question, user transcript (raw and corrected), timestamps, scores JSON, red flags
- `rewrites`: turn, text, validator verdict
- `readiness_snapshots`
- `purchases`: Paystack reference, pass type, `valid_until`
- `outcomes`: self-reported result after the real interview, reported questions, consent to aggregate

RLS rule: a user sees only their own rows. Admin and advisor access is time-boxed and audited.

### 4.5 Security, privacy, compliance
- **Register with Ghana's Data Protection Commission within 20 days of starting business**, under Act 843, and renew every two years. Penalties for failing to register include fines and imprisonment. ([DPC](https://dataprotection.org.gh/registration/), [ITLawCo](https://itlawco.com/focus-areas/data-protection-and-privacy/ghanas-data-protection-act-2012-act-843/))
- **Minimise data:**
  - Extract the fields we need, then **delete the raw documents after 30 days by default**. The user can choose "delete now".
  - Mask passport numbers at extraction.
  - Never send documents to analytics or session replay.
- Encrypt data at rest (Supabase) and use signed short-lived URLs. Recordings are private and deletable.
- Use the **paid Gemini API tier or Vertex AI**, where prompts aren't used for training. Confirm this in the current terms and name it in the privacy notice.
- Applicants aged 17 and under need a guardian consent flow.
- **Prompt injection through uploads.** A PDF or image can contain hidden text like "ignore previous instructions". Defences:
  - Extraction runs in an isolated call with a strict output schema and no tools.
  - Extracted fields go to the user to confirm.
  - **The Officer and Director never see raw document text, only confirmed profile fields.**
  - Free-text fields are length-capped and wrapped as data in the prompt.
- Voice cloning (optional feature): take a consent recording through Google's gate, keep a store of voices that's easy to delete, and never share it.
- Legal copy has to say three things clearly:
  - we are not a law firm and not affiliated with the US government
  - simulated outcomes are not predictions
  - we don't complete visa forms

### 4.6 Unit economics (rough, per paid user)
Assume 8 full mocks at 4 min (each with a Director plan, a few cents), 40 drills, transcription, grading and extraction:
- Live audio ≈ $1.00
- Transcription ≈ $0.20
- Grading and extraction ≈ $0.30
- LiveKit ≈ $0.30

**Total: under about $2 per user**, before TTS doubles in 2027. The drill audio is pre-rendered once and shared. After 20% VAT and Paystack's 1.95%, the Pass contributes about 75% of its price. Even a fair-use-capped power user stays profitable (see [`PRICING.md`](PRICING.md) §4).

---

## 5. Design direction: built to win

Awwwards judges on design, usability, creativity and content. The CSSDA, FWA and Webby awards look for similar things. Award winners in 2026 favour immersive, scroll-driven storytelling with a distinct point of view, even in fintech: Jeton won Site of the Day for exactly that combination ([Really Good Designs](https://reallygooddesigns.com/web-design-trends-2026/), [Awwwards](https://www.awwwards.com/websites/)). Our point of view is simple and emotional.

### 5.1 The concept: *The Window*
Every Ghanaian applicant pictures the same moment: standing at the glass, and the officer glancing up from the DS-160. The brand turns that moment from fear into readiness.

- **The hero is an interactive window.** The glass starts frosted. When you tap "Ask me a question", an officer question plays (pre-rendered with Flash TTS) and the words appear live as you hear them. You answer, and the glass clears a little. The page tells the whole product story in about 10 seconds without a paragraph of text.
- **Scroll story (three acts):** *Your case* (documents fold into a single "case file" card) → *The window* (the simulation, with a real waveform) → *The debrief* (a single answer transforms from a rambling 40-second transcript into a crisp 12-second one, with the scores counting up).
- **Proof section:** real, consented Ghanaian users, with a first name, city, visa type and outcome. Include refusals that later became approvals, plus the transparency report (§7). No stock photos.

### 5.2 Visual system
- **Type:** a high-contrast editorial serif for display (e.g. *Instrument Serif* or *Fraunces*, set large and tight), paired with a precise grotesk for UI (*Geist* or *Inter Tight*). Numbers use tabular figures for scores and timers.
- **Colour:** deep ink (near-black navy) and warm paper (off-white), with **one** Ghanaian accent: a kente-inspired gold (around `#E0A526`) and a restrained forest green for the "approved" state only. The Ghanaian flag is never used as decoration, and US flags or seals are never used at all.
- **Texture and pattern:** subtle Adinkra-derived geometry as a line pattern, for example *Nkyinkyim* (the zig-zag "life's journey" symbol) or a custom path mark for **Okwan**. The logo is a single continuous line that turns into a window frame.
- **Photography:** a commissioned shoot in Accra (Osu, Airport Residential, Ridge), cinematic and warm, showing students, parents and professionals. This is also an E-E-A-T and trust asset.
- **Sound design:** a soft room tone and a subtle "window slide" UI sound in the simulator. Sound is off on marketing pages until the user interacts.
- **Dark and light themes.** WCAG 2.2 AA. `prefers-reduced-motion` replaces every scroll animation with fades.

### 5.3 The app should feel as good as the landing page
- The interview room shows a single timer, a single waveform, the officer's name plate and nothing else. It is not a chat UI.
- The debrief works like a film edit: a timeline of your interview with markers on the moments that mattered, which you tap to replay.
- Micro-interactions animate on the GPU only (transform and opacity). No layout thrash.

### 5.4 Performance budget (design has to respect it)
- On a **Moto G-class Android on 4G**: LCP under 2.0 s, INP under 150 ms, CLS under 0.05.
- Keep JS under about 120 kB gzip on marketing pages.
- The hero video or WebGL loads *after* LCP.
- Use AVIF images, self-hosted subset fonts with `font-display: swap`, and size-adjusted fallbacks.

### 5.5 How to get there
Hire (or contract) **one senior brand/web designer** who has won an Awwwards Site of the Day before. Budget for the Accra photo shoot. Build the design system in Figma, then as code (Tailwind tokens), before building pages. Submit to Awwwards, CSSDA and FWA at launch, and to The Webbys in the next cycle.

---

## 6. SEO and GEO: the 2026 playbook

What has changed: AI Overviews, AI Mode, ChatGPT Search, Perplexity and Claude now answer many visa questions directly and cite **only a handful of sources** each time. The goal is to be **cited** as well as to rank ([Search Engine Land](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142), [HubSpot](https://blog.hubspot.com/marketing/generative-engine-optimization-best-practices)).

### 6.1 Technical foundation
- Marketing and content pages are **statically pre-rendered or PPR** and served from the edge. Every page has server-rendered HTML with the main content in it, because AI crawlers mostly don't run JS.
- **Core Web Vitals:** LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, measured on real users with Speed Insights and CrUX. Some 2026 agency blogs claim a new "composite CWV score" ([Rivulet IQ](https://www.rivuletiq.com/core-web-vitals-2026-whats-changed-and-how-to-pass/)); that isn't confirmed by Google. Treat CWV as a strong tie-breaker, not as the strategy.
- Clean URLs, canonicals, an XML sitemap (split by type), and `lastmod` values that are actually true.
- `robots.txt` should **explicitly allow search/answer bots**: Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot. Allowing the training bots (GPTBot, ClaudeBot, Google-Extended) is a business decision. We recommend allowing them, because brand recall inside the models is worth more to us than the content. ([AI user-agents reference](https://nohacks.co/blog/ai-user-agents-landscape-2026))
- `llms.txt`: optional and cheap. **Google has said it doesn't use it**, and crawlers rarely fetch it ([geojacker data](https://geojacker.com/llms-txt), [Link Building HQ](https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/)). Add one only if it's simple to maintain.
- Register in **Google Search Console and Bing Webmaster Tools** (Bing's index feeds several AI answer engines). Use IndexNow for fast updates.
- `lang="en-GH"` on Ghana-targeted pages. Add a `.com.gh` redirect (through NIC.gh) as a local signal. An Accra business address in Organization schema and a Google Business Profile, once there is a real office.

### 6.2 Structured data (JSON-LD, all accurate to on-page content)
- `Organization` with `sameAs` pointing to LinkedIn, X, TikTok, YouTube, Instagram, and Crunchbase or Wikidata later
- `WebSite`
- `SoftwareApplication` with `offers` priced in GHS
- `Article` with `author` and `reviewedBy` as `Person` entities. The former-officer advisors have real bios.
- `BreadcrumbList`
- `FAQPage` where the page really is a FAQ. It no longer produces rich results for most sites, but it helps machines understand the page.
- `Dataset` for the wait-time and reported-questions data pages
- `VideoObject` for mock-interview videos

### 6.3 The content moat (things nobody else can publish)
1. **An Accra visa wait-time tracker**, updated daily from State Dept data. It gets linked by news outlets and cited by AI, and it's always fresh.
2. **Reported Questions**: a moderated, anonymised database of what applicants say officers asked them, collected with consent from the outcomes step. Break it down by visa type, program and month. This is first-party data that AI engines cite. User-generated content of this kind is also where Reddit-style trust comes from.
3. **Guides reviewed by experts.** Each page opens with a **40–60-word answer block**, followed by depth, statistics with citations, and the reviewer's byline. Example topics:
   - US student visa interview questions for Ghanaians (2026)
   - The US visa bond: which West African countries it covers (Ghana isn't one) and what that means
   - What a 214(b) refusal means and when to reapply
   - The F-1 funding questions officers ask, and how the I-20 cost is checked
   - Accra embassy interview day: what actually happens
   - The DS-160 mistakes that surface in the interview
   - B1/B2 for parents visiting children in the US
4. **Programmatic pages only where the data really differs.** For example, "F-1 interview for Nursing / Computer Science / MBA applicants from Ghana" pages should be built from Reported Questions and simulator aggregates. Don't create thin template pages; the 2025–26 core updates punished them.
5. **Video and audio.** Short clips of example interviews (clearly simulated), made with 3.8 Flash TTS for two speakers, plus real users' debrief stories. Post them on YouTube, TikTok and Instagram, and embed them on the guide pages with transcripts.
6. **Freshness.** Review everything quarterly. Every policy change (the bond, fees, validity, vetting) gets a same-day update and a news post.

### 6.4 Authority and entity building
- **Former consular officers** as named advisors and reviewers. This is the biggest E-E-A-T lever, and it also makes the product better.
- Digital PR in Ghanaian media (JoyNews, GhanaWeb, Graphic, Citi): publish **our own data**, e.g. "What 5,000 simulated interviews reveal about why Ghanaian F-1 applicants get refused". Seek podcast and radio slots.
- Partnerships with student recruitment agencies, university international offices and churches, with counsellor seats as a B2B product. **EducationUSA Accra** is government-run and won't endorse commercial products, but its pre-departure sessions show where the audience is. ([EducationUSA Accra](https://educationusa.state.gov/centers/educationusa-accra))
- Answer questions genuinely on Reddit (r/f1visa, r/ghana) and Quora. Never astroturf.

### 6.5 Measurement
Track:
- GSC impressions and clicks by cluster
- Referrals from AI answer engines, set up in PostHog/GA4 by channel
- A monthly **AI citation audit**: run 50 target questions through ChatGPT, Gemini, Perplexity and Claude, and log whether we're cited and how accurately
- Share of voice against competitors
- CWV at the 75th percentile

---

## 7. "Real results": how we prove it (and stay honest)
- **Outcome capture:** after the interview date, ask "How did it go?" (approved, 221(g), refused), which reported questions came up, and whether the simulation felt realistic.
- **Quarterly transparency report:** outcomes for users who reached Readiness compared with those who didn't, **with a clear warning about selection bias**. Motivated users both practise more and have stronger cases, so this is not a causal claim.
- **Calibration loop:** reported questions and outcomes feed the officer personas and the scoring weights. Advisors review 50 random debriefs every month for accuracy and tone.
- **Model evals in CI:** golden Case Profiles, adversarial cases (fabrication attempts), the Ghanaian-accent audio set, and grading consistency (the same answer should get the same score, ± a tolerance).
- **Realism evals (§2.2.7):**
  - a quarterly blind real-vs-simulated test
  - novelty and coverage metrics per session
  - the grounding-error rate, gated in CI with simulated applicants: an LLM "applicant" with a given case plays against the Officer, so plan quality can be tested without real users

---

## 8. Go-to-market and pricing

**Full pricing model, unit economics and pricing tests: [`PRICING.md`](PRICING.md).** In summary:
- **Free:** full Case Scan, one mock interview (the officer decides its length, within a hidden cost ceiling) and 3 drills.
- **Sprint:** GHS 149 for 3 mocks. The full amount counts toward a Pass upgrade.
- **Full Prep ⭐:** GHS 299 for 10 full interviews and 60 drills, usable for 6 months (superseded the date-based Interview Pass; see PRICING.md). That's about 3.3% of F-1 government fees.
- **Family Pass:** GHS 599, including joint-interview mode.
- **Pass + Coach:** GHS 899, including a 20-minute live mock with a certified Coach.
- **Pass + Senior Expert:** GHS 1,499, with a former consular officer or senior visa professional.
- **Async expert reviews:** GHS 299 (Coach) or GHS 599 (Senior).
- **How experts work inside the product (vetting, the Window, feedback into the AI, payouts):** [`EXPERTS.md`](EXPERTS.md).
- **Pass rules against fake interview dates and account sharing:** [`PRICING.md`](PRICING.md) §3a.
- **Gift a Pass** for diaspora relatives: $29.
- **Institutional seats:** GHS 199–249.
- **Launch price:** GHS 249 for the first 1,000 passes.
- **Trust policies:**
  - no refunds (every account gets a free mock first)
  - Second Attempt (the pass reactivates free after a refusal)
  - no auto-renewals
  - never outcome-based pricing
- **Margins:**
  - About 75% contribution on the Pass after VAT, Paystack fees and COGS.
  - Services must register for VAT from day one under Act 1151.

**Go-to-market:**
- **Timing:** peaks come in May–August (F-1 for the fall intake) and November–December (the spring intake and holiday B1/B2 travel). Line up content and PR 6–8 weeks ahead of each.
- **Referrals:** GHS 40 to each side, paid when the friend *buys*, never on approval.

---

## 9. Name and domain

**Recommendation: Okwan.**
- The word is Twi for *the way / the road / the path*. It's short, easy to say, clearly Ghanaian, and reads well around the world.
- It carries the idea of the journey, so it can stretch to UK, Canada and Schengen interview prep later without a rebrand.
- A web search found no existing Ghanaian company using the name. **Still run formal trademark checks** with Ghana's Registrar-General (Office of the Registrar of Companies) and the USPTO before buying.
- Why not "Mock Embassy": a name containing *embassy* can suggest a government connection, which is a trust and legal risk. An exact-match keyword domain also gives no ranking advantage in 2026. (For the record, `mockembassy.com` was available. It could serve as a defensive redirect.)

**Domain availability, checked 25 Sep 2026 through the Vercel registrar API:**

| Domain | Available | Price |
|---|---|---|
| **okwan.ai** (primary) | ✅ | $160 / 2 yrs (.ai has a 2-year minimum) |
| okwan.app | ✅ | $9.99 first year, then $15/yr |
| getokwan.com | ✅ | $11.25 / yr |
| okwan.co | ✅ | $29.99 first year |
| okwan.io | ✅ | $14.99 first year, then $46/yr |
| okwan.com | ❌ taken (could be approached later) | — |

Also register `okwan.com.gh` through a Ghanaian registrar. It isn't sold through Vercel.

**Alternatives checked and available:** `windowready.app` / `windowready.ai` (a descriptive English name built on the window concept), `ahoto.ai` (Twi, "peace of mind"), `boafo.app` (Twi, "helper").

Availability changes quickly, so buy soon if you're going with it. The domain was **not purchased**, because that needs your account and approval.

---

## 10. Roadmap

**Phase 0 (weeks 0–2): validation, before code**
- Interview 20–30 recent applicants in Accra and Kumasi, approved and refused, and record their real question sequences with consent. **This becomes the seed data for the probe taxonomy and the reference set for the blind realism test.**
- Write the first probe taxonomy (F-1, B1/B2) with the advisors.
- Run 10 Wizard-of-Oz mocks: a human plays the officer over a call.
- Engage 1–2 former consular officers as advisors.
- Register with the DPC.
- Prototype the Window using a direct Gemini Live WebSocket, and measure latency and data use from Accra. Spike LiveKit + 3.8 Live tool calls (§4.3).

**Phase 1 (weeks 3–10): MVP (F-1 first, then B1/B2)**
- Build the marketing site with the design system, the hero window and the first 10 guides. Auth, Paystack passes, the Case File plus Case Scan, the Window on LiveKit, the Debrief with the fabrication validator, Readiness, and the eval suite in CI.
- Launch in the weeks before a peak intake.

**Phase 2 (months 3–6):**
- WhatsApp drills
- Parents mode, with Twi/Ga/Ewe explanations in the debrief
- The drill library (Flash-Lite TTS)
- The wait-time tracker and Reported Questions data pages
- The counsellor dashboard
- The own-voice shadowing experiment

**Phase 3:** J-1, H-1B/L-1, K-1 and DV interview modules, and expansion to Nigeria and other West African posts. The brand works across the region.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Sessions feel repetitive or generic | Director with memory, novelty rejection, sampled officer traits, per-case probes, and realism metrics (§2.2) |
| The Officer asks strange or unrealistic questions | Taxonomy-bounded probes, advisor-owned phrasing ladders, the blind realism test |
| The Officer misstates the user's facts | Officer file limited to confirmed fields, a Referee grounding check, and a target of 0 grounding errors |
| LiveKit plugin problems with 3.8 Live async tools | Phase 0 spike. Own thin agent, or the direct WebSocket as fallback. |
| Users treat a simulated "approved" outcome as a prediction | Label it as a training signal in the UI, in the copy and in the debrief. Show no approval percentages. |
| The model hallucinates a stronger answer that isn't true | Rewrites may only use facts from the confirmed profile, and a validator blocks new entities or numbers. Advisors audit samples. |
| ASR errors on Ghanaian English lead to unfair scores | Grade from audio, let users correct transcripts, and keep a Ghanaian-English eval set. |
| Latency or data costs on mobile | Opus over WebRTC, EU regions, low-data mode, and showing the data cost up front. |
| Policy churn (bond, fees, vetting, validity) | Watch State Dept and embassy pages, and make same-day content updates. |
| Model pricing changes (TTS doubles on 1 Jan 2027) | Pre-render and cache, use Flash-Lite for bulk, and route models behind an abstraction. |
| Regulatory issues (data protection, and any appearance of legal advice) | DPC registration, data minimisation, clear disclaimers, and no form-filling. |

---

## Sources

**Gemini models**
- Google, *Gemini 3.8 Flash TTS and Flash-Lite TTS*: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-text-to-speech/
- tbreak, 3.8 Flash TTS voice cloning: https://tbreak.com/gemini-3-8-flash-tts-voice-cloning/
- The Next Web, 3.8 TTS voice design and cloning: https://thenextweb.com/news/gemini-tts-3-8-flash-voice-design-cloning
- eesel AI, 3.8 Flash TTS pricing: https://www.eesel.ai/blog/gemini-3-8-flash-tts-pricing
- Artificial Analysis, Gemini 3.8 Flash: https://artificialanalysis.ai/models/releases/gemini-3-8-flash
- SiliconANGLE, Gemini 3.8 Live: https://siliconangle.com/2026/09/15/googles-new-speech-model-gemini-3-8-live-supports-real-time-reasoning/
- MarkTechPost, Gemini 3.8 Live: https://www.marktechpost.com/2026/09/15/google-releases-gemini-3-8-live-and-3-8-live-extended-thinking-for-production-grade-voice-agents/
- Developers Digest, 3.8 Live benchmarks and pricing: https://www.developersdigest.tech/blog/gemini-3-8-live-extended-thinking-release-guide-2026
- Google Cloud, 3.8 Live developer guide: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live
- Gemini API, Live ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- Gemini API, Live session management: https://ai.google.dev/gemini-api/docs/live-session
- Google Cloud, Live API async function calling: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/asynchronous-function-calling
- livekit/agents issue #7302: https://github.com/livekit/agents/issues/7302
- LiveKit, Gemini Live plugin: https://docs.livekit.io/agents/models/realtime/plugins/gemini/
- eesel AI, Gemini 3.5 Transcribe: https://www.eesel.ai/blog/gemini-3-5-transcribe

**Speech recognition, accents**
- AfriSpeech-MultiBench: https://arxiv.org/abs/2511.14255

**Ghana and US visa policy**
- ICEF Monitor, F-1 refusals: https://monitor.icef.com/2026/04/visa-rejections-climb-in-the-us-for-international-students-from-key-markets-including-india/
- Yen.com.gh, Ghana F-1 refusals: https://yen.com.gh/people/302892-us-releases-list-countries-highest-student-visa-refusal-rates-ghana-unenviable-score/
- Alma, visa denial statistics: https://www.tryalma.com/learn/visa-denial-rate-statistics
- State Dept, visa bond expansion (Mar 2026): https://www.state.gov/releases/office-of-the-spokesperson/2026/03/state-department-expands-visa-bonds-to-combat-illegal-overstay-rates
- Federal Register, visa bond final rule: https://www.federalregister.gov/documents/2026/08/03/2026-15726/visas-visa-bond-program
- Ghana MFA, reversal of visa restrictions: https://mfa.gov.gh/index.php/reversal-of-u-s-visa-restrictions-on-ghana/
- GhanaWeb, social-media vetting: https://www.ghanaweb.com/GhanaHomePage/business/Why-the-US-Embassy-requires-access-to-social-media-for-student-visa-applications-1988975
- The Voice of Africa, extra appointment slots: https://thevoiceofafrica.com/2026/02/18/u-s-embassy-in-ghana-opens-1000-new-visa-interview-slots-amid-high-demand/
- VisaMet, US visa interview questions 2026: https://visamet.com/guides/us-visa-interview-questions-2026-guide
- EduConnect USA, F-1 interview questions 2026: https://educonnectusa.com/2026/05/f1-visa-interview-questions-2026/
- NNU Immigration, visa interview questions: https://www.nnuimmigration.com/us-visa-interview-questions/
- Botelho Law, consular interview questions: https://botelholawgroup.com/consular-processing-interview-questions-2026-guide/
- AllAfrica, Accra 2024 application figures: https://allafrica.com/stories/202505140274.html
- Kuck Baxter, 2.5-minute interviews: https://immigration.net/2026/08/10/why-your-visa-interview-is-only-2-5-minutes-long/
- Boundless, DS-160: https://www.boundless.com/immigration-resources/form-ds-160-explained
- Manifest Law, visa integrity fee: https://manifestlaw.com/blog/immigration/news/visa-integrity-fee/
- US Embassy Ghana, visas: https://gh.usembassy.gov/visas/
- EducationUSA Accra: https://educationusa.state.gov/centers/educationusa-accra

**Competitors**
- Permito roundup: https://permito.ai/blog/best-ai-mock-interview-tools-visa-2026
- VisaInterview.ai roundup: https://www.visainterview.ai/blog/best-ai-visa-interview-prep-tools-2026

**Ghana: payments, internet, data protection**
- Paystack by country: https://www.mctaba.com/learn/paystack/paystack-by-country-nigeria-ghana-south-africa-kenya-rwanda-cote-d-ivoire
- DataReportal, Digital 2026: Ghana: https://datareportal.com/reports/digital-2026-ghana
- Ghana Data Protection Commission, registration: https://dataprotection.org.gh/registration/

**Frameworks, SEO and design**
- Next.js 16: https://nextjs.org/blog/next-16
- Search Engine Land, GEO guide: https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142
- HubSpot, GEO best practices: https://blog.hubspot.com/marketing/generative-engine-optimization-best-practices
- AI user-agents reference: https://nohacks.co/blog/ai-user-agents-landscape-2026
- Link Building HQ, llms.txt: https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/
- Really Good Designs, 2026 web design trends: https://reallygooddesigns.com/web-design-trends-2026/
