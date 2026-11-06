# Employer list — review sheet

Draft of `data/employers.json`: **23 employers**. Researched 2026-11-05 and updated with your first review round. No entry is fully approved until you've checked it.

- **Confidence** is how strongly the sources show a real workforce at or near Hill.
- **Links:** ✅ means it loaded in my automated check on 2026-11-05. ⚠️ means the site blocked the automated check.

## Still open

Your review template still had placeholders for these items, so they're unchanged:

1. **RTX (Pratt & Whitney): keep or drop?** Low confidence: a small field team, and the only source is an expired posting.
2. **L3Harris: keep or drop?** Low confidence: the only source is an expired ~2024 posting, and there are no current Hill-area openings.
3. **Browser check of blocked links:** BAE Systems, SAIC, RTX and Amentum. Do they work or are they broken?
4. **Employers to add** that you know are at Hill (or "none").

## Decided (review round 1)

- **Merged** OO-ALC, the 75th Air Base Wing, AFLCMC and AFNWC into one entry, **"Air Force civilian jobs at Hill"**. Its link is a USAJOBS search for all Air Force Materiel Command civilian jobs at Hill.
- **Dropped:** Pelatron Technologies, Koniag Integration Solutions, Janicki Industries and WesTest Engineering.
- **New category "Base services"** (`base-services`), now on the 75th Medical Group, the Commissary and the Exchange. The clinic's `admin-business` stand-in was removed; the Commissary and Exchange keep their other tags.
- **419th Fighter Wing kept;** its description now ends with "Reserve membership required".
- **`sourceUrl`** is in SPEC.md as an internal field that is never shown on the page.

## Not included (researched and left out)

- **Not enough Hill evidence:** General Dynamics, Booz Allen, Sabel Systems, Astrion, Rantec, Barnes Aerospace, Parsons, Jacobs (now part of Amentum), Peraton, ManTech, KBR and Chemring.
- **Not found at Hill:** Honeywell, GE Aerospace, Kratos and Sierra Nevada.
- **No working jobs link:** the Utah Test and Training Range; DoDEA (no Hill schools found).
- **Possible additions not finished:** The Aerospace Corporation (nonprofit research center, not a contractor), Shofar Communications (no website found), Parc Community Partnership, DISA and DCMA.
- **Dropped in review round 1:** Pelatron, Koniag, Janicki and WesTest.

## Entries

### Prime contractor (8)

#### BAE Systems — confidence: **high**

- Large on-base ICBM team (Sentinel, Minuteman III, Mk21A) supporting the Air Force Nuclear Weapons Center
- Categories: engineering, software-it, admin-business
- Jobs: https://jobs.baesystems.com/global/en/search-results?keywords=Hill%20AFB — ⚠️ TLS error — browser check still needed
- Source: https://clearancejobs.com/jobs/bae-systems-4/hill-afb-ut — ✅ 200
- ⚑ Source is a ClearanceJobs listing page (53 Hill jobs), not a company or news page. Couldn't confirm the keyword search shows Hill results because the page renders in JavaScript. Job ads cite 800–1,200 staff at Hill. BAE supports the government's ICBM office and isn't the Sentinel prime, so 'prime' vs 'services' is debatable.
- Your call: ☐ keep ☐ fix ☐ drop

#### Boeing — confidence: **high**

- Minuteman III guidance support and nuclear-effects testing at Little Mountain; teams at Hill, Ogden and Layton
- Categories: engineering, software-it, admin-business, internships-entry
- Jobs: https://jobs.boeing.com/search-jobs/Utah — ✅ 200
- Source: https://www.standard.net/news/military/2023/feb/06/boeing-wins-1-6b-minuteman-iii-contract-most-work-to-be-done-in-utah — ✅ 200
- ⚑ Jobs link is filtered to Utah, not a single city. Source is from 2023.
- Your call: ☐ keep ☐ fix ☐ drop

#### Lockheed Martin — confidence: **high**

- On-base F-35 sustainment and depot support, plus F-16 and C-130 engineering, field service and IT at Hill
- Categories: engineering, software-it, logistics-supply, trades-maintenance
- Jobs: https://lockheedmartin.eightfold.ai/careers?location=Hill%20AFB%2C%20UT — ✅ 200
- Source: https://lockheedmartin.eightfold.ai/careers/job/996476737937 — ✅ 200
- ⚑ Source is a live job posting (it will expire), not a news article. Old lockheedmartinjobs.com links now 404. Location search may include nearby towns.
- Your call: ☐ keep ☐ fix ☐ drop

#### Northrop Grumman — confidence: **high**

- Sentinel ICBM prime, run from its Roy Innovation Center next to Hill; staff in Clearfield, Ogden and on base
- Categories: engineering, software-it, trades-maintenance, logistics-supply, internships-entry
- Jobs: https://jobs.northropgrumman.com/careers?location=Roy%2C%20UT — ✅ 200
- Source: https://www.utahbusiness.com/press-releases/2026/07/15/northrop-grumman-breaks-ground-new-facility-aerospace-missions-utah/ — ✅ 200
- ⚑ The 11,000 Utah headcount also counts Promontory and Magna, which aren't near Hill; no figure for Roy alone. Agent listed 6 categories; I dropped admin-business to stay within the 5-tag limit.
- Your call: ☐ keep ☐ fix ☐ drop

#### Leidos — confidence: **medium**

- SATCOM, network operations and cyber/security operations roles at Hill AFB and nearby Sunset
- Categories: software-it, admin-business
- Jobs: https://leidos.wd5.myworkdayjobs.com/External?q=Hill%20AFB — ✅ 200
- Source: https://clearancejobs.com/jobs/leidos/utah — ✅ 200
- ⚑ Source is a job-board listing page. Work is mostly IT services, so it could be typed 'services'. No headcount found. careers.leidos.com blocks automated checks; the Workday link works.
- Your call: ☐ keep ☐ fix ☐ drop

#### SAIC — confidence: **medium**

- Systems engineers on base supporting the Air Force's Sentinel ICBM acquisition program at Hill AFB
- Categories: engineering
- Jobs: https://jobs.saic.com/jobs?location=Hill%20AFB — ⚠️ 403 — browser check still needed
- Source: https://clearancejobs.com/jobs/saic/hill-afb-ut — ✅ 200
- ⚑ Only 2 current Hill jobs seen, so the team is probably small. Careers site blocks automated checks; open it in a browser. Could be typed 'services'.
- Your call: ☐ keep ☐ fix ☐ drop

#### L3Harris (Aerojet Rocketdyne) — confidence: **low**

- Small on-base team sustaining the Minuteman III post-boost rocket engine at Hill AFB
- Categories: engineering
- Jobs: https://careers.l3harris.com/en/search-jobs/Utah — ✅ 200
- Source: https://secure.localjobnetwork.com/apply/add/75425405/1 — ✅ 200
- ⚑ Only source is an expired ~2024 job posting. No current Hill-area openings; the Utah search shows only Salt Lake City jobs, a separate electronic-warfare site. Consider dropping.
- **Pending:** Keep or drop? Not answered in your review (the template placeholder was left as-is).
- Your call: ☐ keep ☐ fix ☐ drop

#### RTX (Pratt & Whitney) — confidence: **low**

- F135 engine field service engineers on base supporting the 388th Fighter Wing and Ogden ALC on the F-35
- Categories: engineering, trades-maintenance
- Jobs: https://careers.rtx.com/global/en/search-results?keywords=Hill%20AFB — ⚠️ 403 — browser check still needed
- Source: https://www.career.com/job/pratt-whitney/f135-field-service-engineer-hill-afb-ut-onsite/j202606022356108717760 — ⚠️ 403 — browser check still needed
- ⚑ Small field team only. Source is a single expired posting on a third-party job board. The F135 depot is at Tinker, not Hill. Careers site blocks automated checks. Consider dropping.
- **Pending:** Keep or drop? Not answered in your review (the template placeholder was left as-is).
- Your call: ☐ keep ☐ fix ☐ drop

### Services / support (6)

#### CACI — confidence: **high**

- Automated test equipment sustainment and modernization for the 309th Electronics Maintenance Group at Hill
- Categories: engineering, software-it, logistics-supply
- Jobs: https://searchcareers.caci.com/careers?location=Hill%20AFB%2C%20UT — ✅ 200
- Source: https://www.highergov.com/contract/FA822721D0004-FA822726F0012/ — ✅ 200
- ⚑ Contract runs to 2030 with about 56 staff. Careers page renders in JavaScript; check in a browser that the Hill filter applies.
- Your call: ☐ keep ☐ fix ☐ drop

#### ES3 (Engineering Software System Solutions) — confidence: **high**

- F-16 wing overhauls in Clearfield for the Hill AFB F-16 program office, plus structural engineering in Layton
- Categories: engineering, trades-maintenance, logistics-supply
- Jobs: https://www.es3inc.com/employment/opportunities/ — ✅ 200
- Source: https://www.es3inc.com/f-16-services/ — ✅ 200
- ⚑ Job list isn't location-filtered, but it currently shows many Layton and Clearfield openings.
- Your call: ☐ keep ☐ fix ☐ drop

#### Systems Implementers — confidence: **high**

- Clearfield firm that builds and sustains the MRO Apps depot-maintenance software for Ogden ALC at Hill
- Categories: software-it, logistics-supply, admin-business
- Jobs: https://www.systemsimplementers.com/careers/ — ✅ 200
- Secondary: https://systemsimplementers.isolvedhire.com/jobs/ — ✅ 200
- Source: https://www.highergov.com/contract/FA822419DA003-FA822425F0057 — ✅ 200
- ⚑ Its main Hill contract ran to Jul 9, 2026, and no follow-on was confirmed. The careers page does list a current Hill AFB opening.
- Your call: ☐ keep ☐ fix ☐ drop

#### Amentum — confidence: **medium**

- Warehouse and distribution support for DLA Distribution at Hill AFB
- Categories: logistics-supply, trades-maintenance
- Jobs: https://www.amentumcareers.com/jobs/search?location=Utah — ⚠️ 202 — browser check still needed
- Source: https://www.executivebiz.com/articles/amentum-lands-88m-contract-to-support-dla-distribution-activities — ⚠️ 403 — browser check still needed
- ⚑ Source is from 2022; the contract runs to Mar 2027. Couldn't confirm the Utah filter applies. Amentum now includes Jacobs' former government business, so there's no separate Jacobs entry.
- Your call: ☐ keep ☐ fix ☐ drop

#### E.L. Blake — confidence: **medium**

- Mission planning system support staff at Hill AFB under an Air Force contract running through 2034
- Categories: software-it, engineering
- Jobs: https://elblakecorp.applicantpro.com/jobs/ — ✅ 200
- Secondary: https://elblakecorp.com/careers/ — ✅ 200
- Source: https://www.defensedaily.com/contract-awards/contract-award-elb-services-llc-columbus-georgia-600000000 — ✅ 200
- ⚑ Contract names 'ELB Services LLC'; Hill job ads say 'E.L. Blake'. Probably the same company, but not confirmed.
- Your call: ☐ keep ☐ fix ☐ drop

#### STS Systems Defense — confidence: **medium**

- Engineering support for the F-16 program office at Hill AFB and F-35 paint booth construction there
- Categories: engineering, trades-maintenance
- Jobs: https://jobs.dayforcehcm.com/brs/SGSCANDIDATEPORTAL — ✅ 200
- Source: https://www.highergov.com/news/sts-systems-defense-awarded-21-6-million-f-35-pai-6447945 — ✅ 200
- ⚑ Hill presence is solid, but the careers link is uncertain: this job portal may belong to a related company (STS Government Solutions). No company website found.
- Your call: ☐ keep ☐ fix ☐ drop

### Subcontractor / supplier (1)

#### KIHOMAC — confidence: **high**

- Aircraft sustainment, engineering, composites and logistics support for Hill programs from its Layton site
- Categories: engineering, trades-maintenance, logistics-supply, software-it
- Jobs: https://www.kihomac.com/careers/ — ✅ 200
- Secondary: https://apply.workable.com/kihomac/ — ✅ 200
- Source: https://www.kihomac.com/contact-kihomac/locations/ — ✅ 200
- ⚑ Source shows the Layton site but doesn't name a Hill program; the Hill link comes from a Feb 2026 Ogden ALC order. Job board isn't filtered by location. Arguably 'services' rather than 'subcontractor'.
- Your call: ☐ keep ☐ fix ☐ drop

### Federal civilian (8)

#### Air Force Civilian Career Training (PALACE Acquire, PCIP, interns) — confidence: **high**

- Paid Air Force intern and trainee programs (PALACE Acquire, Copper Cap, PCIP) with positions at Hill
- Categories: internships-entry, engineering, logistics-supply, admin-business, software-it
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1Y — ✅ 200
- Secondary: https://afciviliancareers.com/students-and-graduates/ — ✅ 200
- Source: https://www.usajobs.gov/job/885616700 — ✅ 200
- ⚑ Source is a live posting that will expire; it needs a durable source. Most postings cover many bases, with Hill as one.
- Your call: ☐ keep ☐ fix ☐ drop

#### Air Force civilian jobs at Hill — confidence: **high**

- Ogden Air Logistics Complex depot, 75th Air Base Wing, and Hill's aircraft and ICBM program offices
- Categories: trades-maintenance, engineering, software-it, logistics-supply, admin-business
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1M — ✅ 200
- Secondary: https://afciviliancareers.com/find-a-job/ — ✅ 200
- Source: https://www.dvidshub.net/video/696371/309th-aircraft-maintenance-group-amxg-app-promo-1-b — ✅ 200
- ⚑ Merges four entries (OO-ALC, 75th ABW, AFLCMC, AFNWC), per your decision. The link searches all Air Force Materiel Command civilian jobs at Hill, which is how USAJOBS lists these units. Source: DVIDS video on the 309th AMXG (about 1,900 civilians).
- Your call: ☐ keep ☐ fix ☐ drop

#### Defense Commissary Agency (Hill AFB Commissary) — confidence: **high**

- Runs the Hill AFB commissary grocery store: store associates, checkers, meatcutters
- Categories: base-services, logistics-supply, internships-entry
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=DD34 — ✅ 200
- Secondary: https://corp.commissaries.com/our-agency/careers-with-deca — ✅ 200
- Source: https://corp.commissaries.com/shopping/store-locations/hill-afb — ✅ 200
- ⚑ Now in the new 'Base services' category.
- Your call: ☐ keep ☐ fix ☐ drop

#### Defense Logistics Agency (DLA Distribution Hill & DLA Aviation) — confidence: **high**

- Warehousing and distribution of parts for F-35, F-22, F-16, A-10 and C-130 depot work at Hill
- Categories: logistics-supply, trades-maintenance, software-it, admin-business
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=DD07 — ✅ 200
- Source: https://www.dvidshub.net/news/440870/dla-expanding-dod-visibility-f-35-supply-chain — ✅ 200
- ⚑ dla.mil blocks automated checks, so there's no secondary link.
- Your call: ☐ keep ☐ fix ☐ drop

#### 419th Fighter Wing (Air Force Reserve technicians) — confidence: **medium**

- Reserve F-35 wing hiring civil-service Air Reserve Technicians for aircraft maintenance. Reserve membership required
- Categories: trades-maintenance, admin-business
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF0M — ✅ 200
- Source: https://www.dvidshub.net/news/542624/419th-fighter-wing-celebrates-70-years-reserve-hill-afb — ✅ 200
- ⚑ 'Reserve membership required' added to the description, per your decision. Many postings cover 40+ locations.
- Your call: ☐ keep ☐ fix ☐ drop

#### 75th Force Support Squadron (Air Force Services) — confidence: **medium**

- Nonappropriated-fund jobs at Hill: child development centers, fitness, golf, bowling, lodging, dining
- Categories: admin-business, internships-entry, trades-maintenance
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=AF1M&pp=NA&pp=NF&pp=NL&pp=NS — ✅ 200
- Secondary: https://hillfss.com/careers/ — ✅ 200
- Source: https://hillfss.com/careers/ — ✅ 200
- ⚑ The USAJOBS search often has 0–1 results. hillfss.com/careers may be a better primary link.
- Your call: ☐ keep ☐ fix ☐ drop

#### 75th Medical Group (Defense Health Agency) — confidence: **medium**

- Hill's military clinic, the only military treatment facility in Utah: primary care, pharmacy, mental health
- Categories: base-services
- Jobs: https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&a=DD83 — ✅ 200
- Source: https://www.dvidshub.net/news/363612/af-surgeon-general-medical-enlisted-force-chief-visit-hill-afb — ✅ 200
- ⚑ Now in the new 'Base services' category (the 'admin-business' stand-in is removed). Few openings at any time.
- Your call: ☐ keep ☐ fix ☐ drop

#### Army & Air Force Exchange Service (Hill AFB Exchange) — confidence: **medium**

- Nonappropriated retail at Hill: the main Exchange store, food court and Express shops
- Categories: base-services, logistics-supply, admin-business, internships-entry
- Jobs: https://www.applymyexchange.com/hourly/ — ✅ 200
- Source: https://www.dvidshub.net/news/406436/exchange-senior-enlisted-leader-visits-hill-afb — ✅ 200
- ⚑ Now in the new 'Base services' category. There's no Hill-only link; job seekers search 'Hill AFB' on the site.
- Your call: ☐ keep ☐ fix ☐ drop
