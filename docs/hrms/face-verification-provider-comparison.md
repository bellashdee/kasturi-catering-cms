# Face Verification Provider Comparison (Phase 4B input)

Version 1 · Date 2026-10-10 · Status: **RESEARCH ONLY. No provider selected. No account created. No purchase made. No employee data sent anywhere.**
Prices are from public pages found on this date; they are **not quotes**. "(unverified)" means I could not confirm it from an official page.

## 1. What "genuine" means here
Face **detection** (a face is in the picture) proves nothing. Genuine verification needs: (1) an authorised, consented **enrolment** image of the employee; (2) at every clock event a **liveness / presentation-attack-detection (PAD)** check (a real person, not a photo, screen, mask or injected video); (3) a **match** between the live face and the enrolled face; (4) explicit outcomes (Verified / Failed / Retry / Manual review / Provider unavailable). No option below is spoof-proof.

**A limit that applies to all web-based options:** our app is a web app (PWA). Microsoft's own documentation says its *Web* liveness solution "may be more vulnerable to certain types of attacks" than its mobile SDK, which adds runtime self-protection. A PWA cannot use a native SDK. So the web limitation is a standing residual risk, to be mitigated by GPS, logging, and manual review.

## 2. Options compared

| Criterion | **A. Amazon Rekognition Face Liveness (+ CompareFaces)** | **B. Azure AI Face: liveness with verification** | **C. FaceTec (3D liveness)** | **D. Innov8tif OkayFace (Malaysian eKYC vendor)** | **E. Open-source, self-run** |
|---|---|---|---|---|---|
| Genuine identity verification | Liveness returns a selfie frame for **matching**; matching is a separate CompareFaces call. | **Liveness with face verification** against a reference image, in one flow. | Liveness + 3D face matching (vendor claims). | Face recognition + anti-spoofing (vendor claims). | Matching possible; quality unproven by independent testing. |
| Liveness / PAD evidence | Detects printed photos, paper cut-outs, screen replays, 3D masks and injected/deepfake video (AWS page). **No iBeta/ISO 30107-3 certification statement found on the page.** | **0% penetration in iBeta Level 1 and 2 PAD tests, ISO/IEC 30107-3** (Microsoft docs). Web build weaker than mobile (see §1). Built-in abuse detection. | Vendor says iBeta Level 1 & 2 certified, with later higher levels in a vendor-published report (**check the lab reports**). | Licensed third-party liveness engines (ID R&D IDLive; TOPPAN iDenFace "ISO/IEC 30107 compliant" per press). **Current engine and certificate: unverified.** | **No certification. Weak against photo/screen replay.** Cannot honestly be called "verified" liveness. |
| Access / approval | Self-serve AWS account. | **Gated: Microsoft Limited Access intake form; Face service described as available to Microsoft "managed customers and partners"**. An SME may be refused or delayed. | Quote; **monthly minimum** commitment; or via distribution partners without minimums. | Sales contact needed. | None. |
| Where data goes (PDPA, cross-border) | Liveness is offered in only 5 regions: US East (N. Virginia), US West (Oregon), Europe (Ireland), Asia Pacific (Tokyo), Asia Pacific (Mumbai). **Not Singapore or Malaysia**, so employee face data would be processed **outside Malaysia** (nearest: Tokyo/Mumbai). | Region availability for liveness **unverified**. Microsoft says it keeps **no images or videos** after the session. | Server software runs **on our own servers**, so data stays in our environment (vendor docs). | **Data hosting location unknown.** A Malaysian company, so it may offer in-country hosting: must be asked in writing. | Runs where we host it (our control; our security burden). |
| Retention / deletion by provider | AWS FAQ: may **store and use selfie video to provide/maintain/improve the feature unless you opt out**; **no retention period stated**. Opt-out must be set up (details unverified). | **"We don't store any images or videos from the Face Liveness Check"; not used to train models** (Microsoft docs). Optional quality-filtered session image for audit, which we would choose whether to keep. | Under our control (self-hosted). | Unknown. | Under our control. |
| Fit with our stack (Next.js 16 on Vercel + Supabase) | AWS Amplify **React** liveness component for the front end (AWS page); our server creates/reads sessions. New vendor + AWS credentials to secure. | **Web SDK** or **Microsoft-hosted "Liveness Quick Link"** (redirect, least code). Server creates sessions with short-lived tokens. | Needs a server container we host (not a natural fit for Vercel's serverless functions). | REST/SDK unknown. | Heavy models + server compute; poor fit for serverless; most engineering. |
| Price (public) | Face Liveness **US$0.015 per check** (first 500k, US East example); CompareFaces ~US$0.001 per image (first 1M, tiers vary between pages); region prices for Tokyo/Mumbai **unverified**. 1,000 free CompareFaces images/month for 12 months. | Launch pricing **US$15 per 1,000 liveness transactions** ($0.015 each), **$15.50 per 1,000 with verification** (reposted announcement: **unverified**; official page didn't render amounts). How a session maps to billable transactions: **unverified**. | **By quote; opaque**; monthly minimum. | **By quote.** | No fee; engineering and hosting cost. |
| Ongoing cost / effort | Low–medium effort. Pay per check, failed checks reportedly billed too (unverified). | Medium effort (less with Quick Link) after approval is granted. | High effort and commitment. | Unknown. | Highest effort; unproven security. |

### Rough monthly cost (an **estimate**, not a quote)
Assumptions: every clock-in and clock-out is one liveness check; 22 working days; price ≈ US$0.015 per check (unverified for the chosen region); retries and enrolment checks excluded.

| Staff | Checks / month | ≈ Cost / month |
|---|---|---|
| 68 (today) | 68 × 2 × 22 = **2,992** | **≈ US$45** |
| 500 | 22,000 | ≈ US$330 |
| 1,000 | 44,000 | ≈ US$660 |

## 3. Privacy, PDPA and data-processing notes (technical summary, **not legal advice**)
- Biometric data became **sensitive personal data** under the amended PDPA from **1 April 2025**; the old cross-border "whitelist" regime was removed the same date; DPO and breach-notification duties started **1 June 2025** (law-firm summaries; confirm against the Gazette/Commissioner).
- Any option that sends face images to a provider abroad (A, and B depending on region) needs: explicit employee consent covering overseas processing, a data-processing agreement, a stated purpose and retention, and an incident process.
- Smaller footprint: keep **no live captures**; store only outcome, score and provider session reference; keep the enrolment reference only with consent and delete it on resignation or withdrawal (retention for approval: see retention matrix).

## 4. Recommendation (evidence-based, for your approval; **nothing is done yet**)
1. **Preferred if obtainable: Option B (Azure AI Face, liveness with verification).** It has the strongest *published* evidence: independent iBeta Level 1 and 2 PAD results, no image/video retention by the service, built-in abuse detection, and a hosted Quick Link that minimises our code. **Risks:** the Microsoft access review (an SME may be declined or wait), the weaker web build, and unverified region/price details.
2. **Practical fallback: Option A (AWS).** Self-serve and quick to prove in staging, similar per-check cost, but: no certification statement found, content may be retained unless we opt out, and processing is outside Malaysia in every available region. It needs written PAD evidence and the opt-out before any real employee face is used.
3. **Ask Innov8tif (Option D)** for a written quote, data-hosting location and certificates, because in-country processing could simplify the PDPA position.
4. **Not recommended:** E as the "verified" mechanism (no genuine liveness). It could at most feed a **Manual Review** queue. C only if management accepts a monthly commitment and self-hosting.

### Approvals I would need before any step (none requested yet)
| Step | Who | Sends employee data? |
|---|---|---|
| Submit Microsoft's intake form (company details only) | Management | No |
| Email AWS / Microsoft / Innov8tif for written PAD certificates, regions, retention terms | Management | No |
| Create a provider account and a staging proof-of-concept | Management | **Only with consenting volunteers, after written consent** |
| Production use | Management + legal adviser | Yes |

## 5. Sources
- [Amazon Rekognition Face Liveness](https://aws.amazon.com/rekognition/face-liveness/) · [Amazon Rekognition pricing](https://aws.amazon.com/rekognition/pricing/)
- [Azure Face liveness detection (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/concept-face-liveness-detection) · [Azure Face limited access / use cases](https://learn.microsoft.com/legal/cognitive-services/face/transparency-note)
- [FaceTec pricing](https://www.facetec.com/pricing)
- [Innov8tif × ID R&D](https://idrnd.ai/?p=1811) · [Innov8tif × TOPPAN IDGATE](https://fintechnews.my/46172/security/toppan-idgate-innov8tif-partnership/)
- PDPA amendment timeline: [DFDL summary](https://www.dfdl.com/insights/legal-and-tax-updates/malaysia-implementation-of-the-personal-data-protection-amendment-act-2024/) · [Baker McKenzie](https://insightplus.bakermckenzie.com/bm/data-technology/malaysia-personal-data-protection-amendment-act-2024-to-come-into-force)
