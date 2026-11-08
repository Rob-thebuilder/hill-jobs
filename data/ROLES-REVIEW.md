# Roles review sheet

The `roles` lists in `data/employers.json` let job seekers search by trade ("painter", "LO", "networking", "admin"). Researched 2026-11-08. **Nothing here is approved until you've checked it.**

- **Confidence:**
  - **high:** a source shows this exact job at Hill.
  - **medium:** a source shows the job nearby or for this employer's Hill program, but the title is paraphrased.
  - **⚑ uncertain:** inferred, or the source is old or doesn't name Hill.
- **Federal evidence:**
  - Counts like "PAINTER ×3" are postings at Hill AFB in the USAJOBS historic-postings API, Nov 2024–Nov 2026: `https://data.usajobs.gov/api/historicjoa`, by agency code, filtered to Hill AFB, Utah.
  - The 2017 Air Force civilian flyer is [Hill AFB enduring skills (Weber State)](https://www.weber.edu/wsuimages/military-affiliated/PDFs/hill-afb-flyer.pdf).
- **Live titles:** every build also adds the job titles open right now: USAJOBS for federal cards, and each contractor's careers site, limited to Hill AFB and Northern Utah (`data/job-sources.json`, `data/locations.json`). So a current posting is searchable even if it isn't listed here.

## Ask the LO expert

**Answered (2026-11-08): LO is a painting/coating trade.** "LO", "low observable", "stealth coatings", "painter", "paint", "coater" and "coatings" are now one synonym group, so all of them find the same employers.

Still open:

1. **How does the Air Force post LO work at Hill?**
   - The 2017 flyer says "Aerospace Painter/Stealth Coatings Technician (~100 per year)".
   - Two years of USAJOBS postings show only `PAINTER` (WG-4102, ×3) and `COMPOSITE/PLASTIC FABRICATOR` (WG-4352).
   - I listed both "Aircraft painter" and "Stealth coatings (LO) technician" for *Air Force civilian jobs at Hill*. Is that right, and is there a better title?
2. **419th Fighter Wing:** I added "Low observable (LO) technician" because the 419th runs an LO section ([AFRC article](https://www.afrc.af.mil/News/Article-Display/Article/965149/reservists-help-keep-f-35-stealthy/)). Do Air Reserve Technicians do LO work as civilians, and under what title?
3. **Lockheed Martin:**
   - Its Hill F-35 "Structures/Sheet Metal Technician" postings include LO coatings application ([posting](https://www.lockheedmartinjobs.com/job/hill-air-force-base/structures-sheet-metal-technician-f-35-level-4/694/96302247168)).
   - I added "LO coatings technician (F-35)" as a role. Is that a real job there?
4. **Synonym groups** in `data/synonyms.json`:
   - Should "RAM", "sealant", "depaint", "stealth" or "restoration" join the painting/LO group?
   - Should "A&P" match "aircraft mechanic"? A&P is an FAA certificate, not a job title; I added it so A&P holders find mechanic jobs.
5. **Other contractors with LO techs at Hill** that this list is missing.

## Federal employers

### Air Force civilian jobs at Hill (AF1M): 849 Hill postings in 24 months
| Role | Evidence | Confidence |
|---|---|---|
| Aircraft painter | PAINTER ×3 (WG-4102); flyer "Aerospace Painter" | high |
| Stealth coatings (LO) technician | flyer only (2017) | ⚑ uncertain (see LO question 1) |
| Composite/plastic fabricator | ×8 incl. leader/inspector (WG-4352); flyer "Composites Technician" | high |
| Sheet metal mechanic | ×13 (WG-3806) | high |
| Aircraft mechanic | ×12 (WG-8852) | high |
| Pneudraulic systems mechanic | ×17 (WG-8255) | high |
| Electronic integrated systems mechanic | ×18 (WG-2610) | high |
| Electronics mechanic | ×5 (WG-2604) | high |
| Aircraft engine mechanic | ×4 (WG-8602); flyer | high |
| Nondestructive tester (NDI) | flyer only | medium |
| Machinist | ×7 incl. leader | high |
| Electroplater | ELECTROPLATER LEADER ×1; flyer | medium |
| Powered support systems mechanic | ×7 (WG-5378) | high |
| Engineering technician | ×12 (NJ-0802) | high |
| Electronics technician | ×12 | high |
| Production controller | PRODUCTION CONTROLLER (AIRCRAFT) ×6 | high |
| Equipment specialist | live posting today; flyer | high |
| General engineer | ×18 | high |
| Aerospace engineer | ×6 | high |
| Electronics engineer | ×7 | high |
| Computer scientist | ×6 | high |
| IT specialist (network/infosec) | ×20+ across NETWORK/INFOSEC/SYSADMIN | high |
| Telecommunications specialist | ×7 | high |
| Logistics management specialist | ×19 | high |
| Administrative support specialist | ×2 (NH-0301); also CLERK ×2, SECRETARY (OA) ×3 | high |

### 75th Force Support Squadron (AF1M, NAF pay plans NA/NF/CY)
- **Roles, all high:** child and youth program assistant (×13), recreation assistant (×15), guest services representative (×8), cook (×13), food service worker, custodial worker (×5), laborer (×5), automotive mechanic (×2), mobile equipment servicer (×4), office automation clerk (×4), human resources assistant (×6), accounting technician (×5), cashier, library technician.
- ⚑ Caveat: these are Air Force NAF postings at Hill, assumed to be the 75th FSS. NAF jobs at Hill are almost always FSS, but the postings don't name the squadron.

### Air Force Civilian Career Training (AF1Y): 57 Hill postings
- **Roles, all high:** student trainee (intern), engineer (PALACE Acquire intern), contract specialist, logistics management specialist, inventory management specialist, financial management specialist, cost analyst, acquisition program manager, operations research analyst, computer scientist, data scientist, chemist, mathematician, physicist, occupational safety and health specialist, auditor.

### DLA (DD07): 692 Hill postings
- **Roles, all high:** IT specialist (network/infosec, application software, systems administration; ×200+ IT postings in total), IT project manager, telecommunications specialist, program analyst (×79), inventory management specialist, general supply specialist, supply technician, supply systems analyst, distribution process worker, materials expediter, contract specialist, environmental protection specialist, data scientist.
- **Materials handler (forklift operator):** medium. It's a [USAJOBS listing](https://www.usajobs.gov/job/875064700) found in search, but it isn't in the 24-month pull.

### DeCA Commissary (DD34): 64 Hill postings
- **Roles, all high:** store associate, sales store checker, store worker, meatcutter, grocery/meat/produce department manager, store manager, commissary officer, secretary, student trainee.

### Exchange (AAFES): no USAJOBS feed
- **Roles, all medium:** customer experience associate, roving store worker (cashier), food service worker (Burger King), food service foreman (Charley's).
- Sources are aggregator copies of Exchange postings at Hill, e.g. [Food Service Worker](https://thinkbeyondthelabel.dejobs.org/hill-afb-ut/food-service-worker-burger-king-regular-part-time/EEBEF54645734FFA9DC84040E36C0BF3/job) and [Customer Experience Associate](https://amvetsjobs.org/hill-afb-ut/custome-experience-associate/68C0FD74DA7B4C9CAC5518E0F76EB88B/job/).

### 419th Fighter Wing (AF0M): 149 Hill postings
- **Roles, high:** aircraft mechanic (×15, F-35 wing), aircraft ordnance systems mechanic (×26), electronic integrated systems mechanic (×25), aircraft overhaul leader (×12), composite/plastic fabricator (×7), ordnance equipment mechanic (×8), powered support systems mechanic (×7), aircraft engine mechanic, aircraft survival and flight equipment repairer, sheet metal mechanic, human resources specialist (military), training technician, administrative support assistant.
- **Low observable (LO) technician:** ⚑ uncertain (see LO question 2).

### 75th Medical Group (DD83)
- **Roles, all high:** medical technician, nurse (clinical), pharmacy technician, physical therapist, diagnostic radiologic technologist, clinical psychologist, medical support assistant (office automation).
- ⚑ The historic pull for DD83 hit a USAJOBS server error partway, so this list may be incomplete.

## Contractors

Sources are job postings at Hill or nearby. Many are aggregator copies, and some have expired; they show the kind of work, not current openings.

| Employer | Roles | Confidence and source |
|---|---|---|
| **Northrop Grumman** | Systems engineer, software engineer, electronic technician, field technician (Sentinel), subcontract technical engineer, industrial engineer, manufacturing engineer | high: Roy postings ([Electronic Technician, Sentinel](https://spacecrew.com/space-jobs/lsk0pkhc-northrop-grumman-sentinel-electronic-technician-field-ops-10629), [Subcontract Technical Engineer](https://www.themuse.com/jobs/northropgrumman/sentinel-subcontract-technical-engineer-5d478b)) |
| | Manufacturing technician, maintenance technician, composite bonder technician, aircraft structures mechanic | ⚑ Clearfield postings may belong to a different Northrop business, not the Hill/Sentinel work |
| | Engineering intern | ⚑ inferred from the entry-level category |
| **Lockheed Martin** | Structures/sheet metal technician (F-35), NDI inspector, aircraft field support engineer (F-35), research scientist (supportable low observables) | high: Hill postings ([sheet metal](https://www.lockheedmartinjobs.com/job/hill-air-force-base/structures-sheet-metal-technician-f-35-level-4/694/96302247168), [NDI](https://www.lockheedmartinjobs.com/job/hill-air-force-base/nondestructive-testing-ndi-inspector-f-35-level-4/694/93767486720), [field support engineer](https://www.lockheedmartinjobs.com/job/hill-air-force-base/aircraft-field-support-engineer-staff-f-35-level-4/694/96529851168), [LO research scientist](https://www.lockheedmartinjobs.com/job/hill-air-force-base/research-scientist-sr/694/90762224032)) |
| | LO coatings technician (F-35) | ⚑ see LO question 3 |
| | Field service engineer | medium |
| | Logistics analyst, IT systems administrator | ⚑ inferred from the existing description ("logistics… IT at Hill"), no posting found |
| **Boeing** | Guidance, navigation and control engineer; systems engineer; flight control systems engineer; propulsion systems engineer; early career engineer | high: Hill postings ([GN&C](https://jobs.boeing.com/job/hill-air-force-base/guidance-navigation-and-controls-analysis-engineer/185/96667163712), [systems](https://jobs.boeing.com/job/hill-air-force-base/systems-engineer-associate-or-mid-level/185/101280474416), [flight controls, early career](https://jobs.boeing.com/job/hill-air-force-base/icbm-minuteman-flight-control-systems-engineer-early-career/185/102790580368)) |
| | Test engineer, software engineer | ⚑ inferred |
| **BAE Systems** | Systems engineer, command and launch engineer, systems security engineer, modeling and simulation engineer, flight test engineer, command and control engineer, engineering technician | high: Hill postings ([systems security](https://www.clearancejobs.com/jobs/8985865/systems-security-engineer), [MM III M&S lead](https://www.clearancejobs.com/jobs/9095667/mm-iii-modeling-and-simulation-lead), [junior engineering technician](https://www.clearancejobs.com/jobs/8971389/junior-engineering-technician)) |
| | Program control analyst | ⚑ inferred from the admin category |
| **Leidos** | Network engineer, SATCOM network engineer, SATCOM IP network support specialist | high: Hill postings ([network engineer](https://careers.gijobs.com/job/technology/network-engineer/5658809/network-engineer), [SATCOM IP support](https://www.clearancejobs.com/jobs/8472952/satcom-ip-network-support-specialist)) |
| | Network operations center (NOC) technician, cybersecurity analyst | ⚑ the NOC posting found was for another program; cyber is inferred from the description |
| **SAIC** | Systems engineer, principal systems engineer, reliability and maintainability engineer, nuclear surety engineer, communications systems engineer, modeling/simulation/analysis engineer, software systems engineer, systems engineering manager | high: Hill Sentinel postings ([principal SE](https://www.clearancejobs.com/jobs/8734721/principal-systems-engineer), [nuclear surety](https://www.clearancejobs.com/jobs/8977028/nuclear-surety-engineer), [SE manager](https://www.clearancejobs.com/jobs/9134602/systems-engineer-manager)) |
| **RTX (Pratt & Whitney)** | F135 field service engineer | medium: one expired posting (existing source) |
| | Field service representative, engine maintenance technician | ⚑ inferred. The whole entry is still "keep or drop?" in REVIEW.md |
| **L3Harris (Aerojet Rocketdyne)** | Rocket engine sustainment engineer, field service engineer, systems engineer | ⚑ all inferred. The whole entry is still "keep or drop?" in REVIEW.md |
| **KIHOMAC** | Composite technician, aerospace coater, sheet metal technician | high: Layton postings ([composite](https://www.clearancejobs.com/jobs/9027567/craftsman-composite-technician), [aerospace coater](https://diversity.usnlx.com/layton-ut/aerospace-coater-2nd-3rd-shift/32931936ED6747B293FB28CA7B45727D/job), [sheet metal](https://clearancejobs.com/jobs/8193565/master-craftsman-sheet-metal-technician)) |
| | Aircraft structural repair technician | medium |
| | Machinist, structures engineer, logistics specialist, quality inspector | ⚑ inferred from the company's Layton work |
| **ES3** | Aircraft wing shop technician, sheet metal mechanic (aircraft), F-16 structural repair specialist, aerospace engineer (MRO), aircraft technical support manager | high: Clearfield postings ([wing shop](https://www.career.com/job/es3/aircraft-wing-shop-technician/j202510030810493305667), [structural repair SME](https://career.com/job/es3/subject-matter-expert-f-16-structural-repair/j202502171141406814125), [sheet metal](https://ability.usnlx.com/clearfield-ut/aircraft-sheetmetal-mechanic/797ECDB9FE744C0EBCE12D14186DC72C/job)) |
| **Systems Implementers** | Java web developer, systems analyst, configuration manager | high: Clearfield/Hill postings ([Java developer](https://tealhq.com/job/java-web-developer_6fed0ba8-725c-43b6-a29b-833a3a87fe96), [analyst/config manager](https://www.tealhq.com/job/jr-analyst-configuration-manager_7ea1a44fd2deb67329ba0a6653a5283308824)) |
| | Software developer | medium |
| | Database developer (Oracle) | ⚑ from the tech stack in a posting |
| **CACI** | Test systems hardware/software engineer, test and evaluation engineer, electronics technician, software engineer | ⚑ **all uncertain**: no posting found that names CACI at Hill. These are typical automated-test-equipment roles from the contract scope |
| **Amentum** | Warehouse specialist, shipper/packer, warehouse team lead | high: Hill postings ([warehouse lead](https://my.recruitmilitary.com/job/43576690/Warehouse-Specialist-2nd-Shift-Amentum-Hill-Air-Force-Base-UT), [shipper/packer](https://amentum.dejobs.org/hill-afb-ut/shipperpacker-pppm-1st-shift/3304DBCE7F3843E0BA006F7F74D06739/job)) |
| | Forklift operator, material handler | medium |
| **STS Systems Defense** | Systems engineer (F-16 design and interface) | high ([posting](https://www.dice.com/job-detail/330d4149-89a0-4ea0-963e-fddf1677b4b4)) |
| | Engineering technician (F-16 avionics), avionics technician | ⚑ that posting is from **STS Systems Support**, a sibling company |
| | Electrical engineer | ⚑ inferred |
| **E.L. Blake** | Mission planning subject matter expert, MPC team lead, help desk specialist, information assurance manager, configuration manager, technical publications specialist, software security analyst | high: Hill postings ([Tech Ops Lead/SME](https://www.career.com/job/e-l-blake-inc/technical-operations-lead-sme/j202605300815143199473), [Help Desk](https://www.careerbuilder.com/job-details/help-desk-specialist-hill-air-force-base-ut--17d7456d-5590-47f1-ab7a-94a0d1d8c418), [MPC team lead](https://career.com/job/e-l-blake-corp/mpc-team-lead/j202502171354423588656)) |

## What the five example searches return now

These results are from the build on 2026-11-08, with live titles. `node --test` prints the researched-roles-only version every run.

- **painter / coater / LO** (same 5):
  - Air Force civilian jobs at Hill (Aircraft painter)
  - KIHOMAC (Aerospace coater)
  - Lockheed Martin (LO coatings technician ⚑)
  - 419th Fighter Wing (Low observable (LO) technician ⚑)
  - Northrop Grumman (open job "Manufacturing Technician - Coatings 2/3", Clearfield)
- **networking** (7):
  - Air Force civilian jobs at Hill and DLA (IT specialist (network/infosec))
  - Leidos (Network engineer)
  - Lockheed Martin (IT systems administrator ⚑)
  - BAE Systems (open job "Cybersecurity Analyst (ISSO)")
  - ES3 (open job "Network, Systems & Cybersecurity Administrator")
  - Northrop Grumman (open job "Sr Principal Cyber Architect")
- **admin** (8):
  - 75th FSS (Office automation clerk)
  - 75th Medical Group (Medical support assistant (office automation))
  - 419th (Administrative support assistant)
  - Air Force civilian jobs at Hill (Administrative support specialist)
  - DeCA (Secretary)
  - BAE Systems (open job "Office Manager / Business Ops Analyst")
  - Northrop Grumman (open job "Sentinel Administrative Assistant 4")
  - Lockheed Martin (open job "… Database Admin Lvl 3"; this matches the word "Admin" literally, but it's an IT job)

## Live contractor titles (build of 2026-11-08)

| Employer | Titles near Hill | Notes |
|---|---|---|
| Northrop Grumman | 529 | Mostly Clearfield (aerostructures/composites) plus Roy (Sentinel) |
| BAE Systems | 46 | Hill AFB |
| KIHOMAC | 21 | Layton |
| Lockheed Martin | 16 | Hill AFB and Clearfield |
| Leidos | 9 | Sunset and Ogden |
| ES3 | 7 | Layton and Clearfield |
| E.L. Blake | 6 | Hill AFB |
| CACI | 2 | Language analysts listing Hill AFB as one location |
| Boeing | 1 | Its search pages are blocked by robots.txt; only its sitemap can be read, and it lists few jobs |
| Systems Implementers | 1 | Clearfield |
| L3Harris | 0 | Its Utah jobs are all in Salt Lake City, which is outside "Northern Utah" |
| SAIC, RTX | not read | The sites refuse automated requests |
| Amentum, STS, Exchange | not read | No usable location filter or public feed (see `data/job-sources.json`) |
