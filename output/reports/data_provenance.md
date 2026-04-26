# Data Provenance Audit — Mukund Venkat Roadmap

> Last updated: 2026-04-26 · This is the source-of-truth for every claim in `index.html` and the four reports.

Every assertion is tagged:

- 🟢 **Verified** — directly observable in scraped data or fetched from a primary source
- 🔵 **User-provided** — supplied in the brief by the user
- 🟡 **Directional** — third-party benchmark from a credible source, but not Mukund-specific
- 🟠 **Inferred** — reasoned from data but not directly observed
- 🔴 **Assumption** — placeholder default, requires validation
- ⚪ **Unknown** — gap; needs research

---

## A. Mukund's Instagram corpus (last 50 posts, 30 Jan → 25 Mar 2026)

| Claim | Tag | Source |
|---|---|---|
| 29,206 followers, 7,546 following, 3,643 lifetime posts | 🟢 | `output/data/profile.json` (Apify `instagram-profile-scraper`, 26 Apr 2026) |
| 50 posts: 31 reels / 13 carousels / 6 images | 🟢 | `output/data/raw_instagram_posts.json` |
| Avg engagement 0.44%, avg likes 120, avg comments 8.5 | 🟢 | `output/data/post_aggregates.json` |
| Avg video views 955, median 471 | 🟢 | `output/data/post_aggregates.json` |
| 1 of 50 posts contains apply/DM CTA, 2 of 50 any CTA | 🟢 | Regex CTA detector in `scripts/normalize_posts.js` |
| Topic mix (mindset 27, training 9, lifestyle 8, HYROX 4, ...) | 🟠 | Keyword classifier in `normalize_posts.js`. **Caveat:** topic is regex-derived, not human-coded. Some "mindset" overlaps with strength/HYROX. Numbers are directional. |
| Top reel by views: "Are you stuck on your fat-loss journey?" — 6,746 views | 🟢 | Scraped views field |
| HYROX content drives top 3 of top 6 by engagement | 🟢 | Scraped likes+comments aggregated |
| Bio reads "🥇 Helping High Performers Build Muscle & Confidence … DM 'ELITE' to Apply." | 🟢 | Scraped bio field |
| 1 reel video URL expired during analysis (DVRc-9tjD8w) | 🟢 | `gemini_post_analysis.json` error field |

## B. Gemini-derived analysis (30 reels)

| Claim | Tag | Source |
|---|---|---|
| Hook clarity / pattern-interrupt scores per reel | 🟠 | Gemini 2.5 Flash output, `output/data/gemini_post_analysis.json`. Subjective scoring — variance ±2 expected |
| Psychological trigger averages (12 dimensions, 0–10) | 🟠 | Gemini per-reel; aggregated in HTML. Averages are stable across reels but each reel score is model judgment |
| Improved hook / improved CTA / improved caption per reel | 🟠 | Gemini suggestions — illustrative, need A/B testing before adoption |
| "Strong: aspiration, identity, self-efficacy, relatability. Weak: urgency, social_proof, fear_of_loss" | 🟢 | Computed from trigger averages |
| Audience implied: "busy men 30s-50s, fathers, hybrid athletes, holistic transformation seekers" | 🟠 | Gemini synthesis — based on **content Mukund makes**, NOT on **who is watching**. See §D for actual audience |

## C. User-provided business inputs (from brief)

| Claim | Tag | Source |
|---|---|---|
| £997 / 3 months online coaching price | 🔵 | Brief §2 |
| £50–£60 per session in-person PT | 🔵 | Brief §2 |
| ~25–30 PT hours / week | 🔵 | Brief §2 |
| ~£5,000 / month current run-rate | 🔵 | Brief §2 |
| £997/3 = £332.33/month recognised per active client | 🔵 | Math from above |
| Channels: YouTube, Instagram, TikTok, LinkedIn | 🔵 | Brief §2 |

## D. Mukund's actual audience (top 80 most-active commenters)

| Claim | Tag | Source |
|---|---|---|
| 80 commenter profiles scraped from 155 unique commenters | 🟢 | `output/data/commenter_profiles.json` (Apify `instagram-profile-scraper`) |
| Geography (of those classified): UK 21% (17), India 15% (12), EU 10% (8), Unknown 39% (31), Other 15% | 🟢 | Gemini classification of bios in `audience_classification.json` |
| London likelihood (avg 0–10): 1.96 | 🟠 | Gemini-inferred from bio cues. Conservative (defaults to low without flag/keyword evidence) |
| ICP fit (busy London prof 30–50): avg 1.11/10, only 4 of 80 score ≥6 | 🟠 | Gemini-inferred from bio. Low because most commenters are fitness-pros, not target buyers |
| 19% of top engagers (15/80) are fitness-pro peers | 🟢 | Bio + business-category classification |
| Audience composition is global, not London-concentrated | 🟢 | Conclusion from above |
| **Implication:** UK-first thesis is *contradicted* by organic audience data | 🟠 | Strategic inference. Paid acquisition or repositioning required |

**Methodology caveat:** classification is from public bios only — many bios are sparse, leading to high "unknown" rate. To improve confidence, sample 200+ profiles or scrape commenters across a longer time window.

## D2. Competitor benchmarks (3 direct UK comps)

| Claim | Tag | Source |
|---|---|---|
| **@enricoargentin** — 35,047 followers, 2.09% ER, 20% CTA rate | 🟢 | Apify scrape 2026-04-26 (`output/data/competitors/enricoargentin.json`) |
| Enrico is London-based (Shoreditch, Old St) | 🟢 | [GymsFitness directory](https://gymsfitness.co.uk/en/i/22180-enrico-argentin-personal-training/) — verified address `301 Old St, EC1V 9LA` |
| Enrico hero offer: 6-week Body Transformation (NOT 12-week) | 🟢 | Same |
| Enrico lead magnet: "first week always free" online + "first free trial session" in-person | 🟢 | [enricoargentin.com/onlinecoaching](https://www.enricoargentin.com/onlinecoaching) |
| Enrico 4.9★ from 56 reviews on directory | 🟢 | GymsFitness directory |
| Enrico content mix: 13% reels, 87% carousels (4 of 30) | 🟢 | Apify scrape |
| **@jamesdeag** (Hybrid Athlete Club) — 1,485 followers, 2.64% ER, 13% CTA rate | 🟢 | Apify scrape |
| Hybrid Athlete Club stats: 89% hit race target, 77% retention post-event, 100% get fitter | 🟢 | [hybridathleteclub.com](http://www.hybridathleteclub.com/) — fetched 2026-04-26 |
| Hybrid Athlete Club lead magnet: "Get two weeks of training free" | 🟢 | Same |
| **Fitness with TJ** — 12-week online £299 (was £329); £110/mo rolling | 🟢 | [fitnesswithtj.co.uk](https://www.fitnesswithtj.co.uk/online-personal-training/12-week-online-coaching-program) — fetched 2026-04-26 |
| TJ shows 15+ named transformation testimonials, timeframes 8-24 weeks | 🟢 | Same |
| TJ Apify re-scrape blocked — wrong handle then 402 quota | 🟡 | `@chillinwithtj` not pulled. Website data only. |
| **Pricing landscape**: TJ £299 → Mukund £997 → Enrico hidden → UP hidden (~£8-15k inferred) | 🟠 | Synthesised from above |
| Mukund's CTA rate (2%) is 6.5-10× lower than competitors | 🟢 | Computed across all four |
| Mukund's ER (0.44%) is 4.7-6× lower than competitors | 🟢 | Computed |

## E. External market sources

### E1. UK Health & Fitness Market

| Claim | Tag | Source |
|---|---|---|
| UK fitness industry £5.7bn revenue 2024, +8.8% YoY | 🟢 | [ukactive — UK Health & Fitness Market Report 2025](https://ukactive.com/news/uk-health-and-fitness-market-report-reveals-exponential-growth-as-penetration-rate-hits-16-9-and-revenue-grows-8-8/) — fetched 2026-04-26. Verified via WebSearch. |
| 11.5m members, 16.9% population penetration, 5,607 clubs | 🟢 | Same source |
| 600m+ visits to UK fitness clubs in 2024 | 🟢 | Same source |
| Joint analysis with Deloitte | 🟢 | Same source |

### E2. London PT Pricing (2026)

| Claim | Tag | Source |
|---|---|---|
| London PT typically £50-£150/hour | 🟢 | Multiple sources: [Nicolina Turcan 2026 Guide](https://www.nicolinaturcan.com/blog/how-much-does-a-personal-trainer-cost-in-london-2026-guide), [Boxing Trainer](https://boxingtrainer.london/cost-of-a-personal-trainer-in-london/) — fetched 2026-04-26 |
| Tier breakdown: entry £40-60 / mid £60-90 / premium £90-120+ | 🟢 | [Nicolina Turcan 2026 Guide](https://www.nicolinaturcan.com/blog/how-much-does-a-personal-trainer-cost-in-london-2026-guide) — verbatim quote: *"personal training in London typically ranges from £40 to £120+ per session"* |
| Mid-range often £60-£90/hr | 🟢 | Same source |
| Specialist / celebrity £150-£800+ | 🟡 | Search aggregation — directional; specialist bracket includes outliers |
| Mukund at £55/session sits at upper-budget tier | 🟠 | Inference comparing user-provided rate vs benchmark above |

### E3. UK Online Coaching Comparables

| Claim | Tag | Source |
|---|---|---|
| Fitness with TJ — 12-week online programme £299 (was £329) | 🟢 | [fitnesswithtj.co.uk/online-personal-training/12-week-online-coaching-program](https://www.fitnesswithtj.co.uk/online-personal-training/12-week-online-coaching-program) — fetched 2026-04-26 |
| TJ payment plan ~£110/month rolling | 🟢 | Same source |
| TJ deliverables: app + recipes + workouts + check-ins + 1:1 chat + habits | 🟢 | Same source |
| TJ shows 15+ named transformation testimonials | 🟢 | Same source |
| Ultimate Performance — 12-week premium transformation, prices not public | 🟡 | [ultimateperformance.com](https://ultimateperformance.com/personal-training/12-week-body-transformation) — quote-only model. Indirect signals: *"not the cheapest"*, multi-Mayfair locations, claim *"97% of clients achieve life-changing results"* |
| Mukund at £997 sits ~3x above TJ, well below UP — mid-premium online | 🟠 | Inference from above two |

### E4. UK Corporate Wellness

| Claim | Tag | Source |
|---|---|---|
| UK avg sickness absence 9.4 days in 2025 (up from 7.8 in 2023, 5.8 in 2022) | 🟢 | [CIPD Health & Wellbeing at Work 2025](https://www.cipd.org/uk/knowledge/reports/health-well-being-work/) — fetched 2026-04-26 via WebSearch |
| Mental ill-health is leading cause of long-term absence | 🟢 | Same source |
| UK ill-health costs £150bn / year | 🟢 | Same source |
| 57% of UK employers now have a wellbeing strategy (+13% since 2020) | 🟢 | Same source |
| 50% of organisations using stress-reduction programmes feel effective | 🟢 | Same source — *opportunity:* the other 50% are unhappy with what they have |
| UK corporate wellness market £708.2m (IBISWorld 2026) | 🟡 | Cited in user brief; **not independently re-verified by me** — IBISWorld is paywalled |
| UK corporate wellness USD 3bn 2025 → 4.6bn 2034 (IMARC) | 🟡 | Cited in user brief; **not independently re-verified** |

### E5. Conversion / funnel benchmarks

| Claim | Tag | Source |
|---|---|---|
| Close rate 30%, show rate 70%, application→booked 40%, lead→app 20%, visit→lead 20% | 🔴 | Took directly from brief §11 — these are **assumed industry benchmarks, not observed for Mukund**. Sliders in HTML let you tune them. |
| Warm DM funnel: 80 sent → 3.5 closes | 🔴 | Same — brief §11 |
| Corporate funnel: 150 prospects → 1 pilot, 1 retainer M3-4 | 🔴 | Same — brief §11 |

⚠️ **These conversion rates are the most-fragile inputs in the model.** They drive the entire "5 sales/month requires X leads" math but are not Mukund-specific. The deep-research prompts (`output/reports/deep_research_prompts.md` Prompts 2 + 7) target replacing these with named-coach observed rates.

## F. Strategic claims

| Claim | Tag | Reason |
|---|---|---|
| "Recommended path is Scenario B (15 active, £4,985 recognised + PT lift)" | 🟠 | My judgment from the four scenarios in the brief. Trades cash certainty for revenue smoothness. User can pick A, C, or D instead. |
| "PT capacity is near full" | 🔴 | Inferred from "25-30 hrs/week" being close to a hard ceiling. Not validated against actual booking calendar. |
| "Move from per-session to packages" | 🟡 | Industry standard advice, supported by Ultimate Performance + most premium London PT business models |
| "YouTube long-form should be the source content" | 🟡 | Standard creator-economy playbook, not Mukund-specific data |
| Recommended £75/session new-client rate | 🟡 | Mid-range of verified £60-£90 mid-tier London PT band |

## G. Open gaps (research wanted)

| Gap | Why it matters | Research approach |
|---|---|---|
| Actual UK funnel benchmarks for solo online coaches | Drives whole funnel math | Prompt 2 + 7 in `deep_research_prompts.md` |
| Mukund's actual close / show / no-show rates | Replaces assumptions | Track for 30 days in CRM |
| Mukund's actual followers-by-country | Refines or refutes "global audience" finding | Use IG Insights — internal data |
| Whether his audience converts despite geo-mismatch | London-strategy might be moot if global converts | Past sales source-of-lead survey (5 questions) |
| Live IBISWorld / IMARC corporate wellness numbers | Justifies pitching | Manual purchase or paywalled access |
| Renewal rate after 12 weeks | Determines LTV | Past client survey |
| Active client count today | Anchors the model | User to provide |

---

## Confidence summary

| Section | Confidence | Notes |
|---|---|---|
| Mukund corpus metrics | High | Direct scrape |
| Gemini per-post analysis | Medium-high | Subjective dimensions; aggregates stable |
| Audience composition | Medium | Sample of 80; methodology caveats apply |
| External market sources | Medium-high | Primary sources verified for fitness market, London PT, CIPD; IBISWorld/IMARC unverified |
| Funnel conversion rates | Low | All from brief; need named-coach validation |
| Scenario projections | Medium | Math is right; inputs need validation |

**Read this file alongside `index.html`. Every number in the HTML maps to a row above.**
