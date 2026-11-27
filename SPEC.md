# Work At Hill — v1 Spec

A one-page directory of employers at Hill Air Force Base, Utah: defense contractors and government employers. Job seekers can see who hires at Hill and go straight to each employer's careers page. The data model supports other depot bases with large civilian workforces (e.g., Tinker AFB, Robins AFB), but v1 shows Hill only.

## 1. Goals

- A job seeker can find a relevant employer and reach its careers page in under 30 seconds, on a phone.
- The page looks distinctive and specific to Hill's aerospace/depot mission. It should not look like a generic link list.
- Recruiters can request a correction or ask to be added without a GitHub account.
- Links stay accurate with minimal manual effort.
- Adding a second base means adding data, not rewriting code.

## 2. Audience

All four groups are first-class users. Copy and categories should serve each of them:

| Group | What they look for |
|---|---|
| Skilled trades / aircraft maintenance | Depot maintenance, A&P, sheet metal, avionics, electricians |
| Engineers & software | Aerospace, systems, embedded, software (e.g., Sentinel/ICBM, F-35 sustainment) |
| Students / new grads | Internships, entry-level roles (Weber State, USU, U of U) |
| Transitioning military / veterans | Employers near Hill that hire people leaving service |

## 3. Design

**Direction: bold aviation/aerospace.**

- **Palette:** deep navy background in the hero, an amber/safety-orange accent for calls to action and active chips, and a light neutral surface for the card grid. All text meets WCAG AA contrast (4.5:1 for body text).
- **Hero:** site name "Work At Hill", a one-line value proposition (e.g., "Who's hiring at Hill AFB, and where to apply."), a live count of employers, and the search box placed directly in the hero.
- **Motif:** one subtle aviation element (runway centerline stripes or a faint aircraft silhouette as inline SVG). No photos in v1, and no US Air Force or DoD seals, logos, or insignia.
- **Cards:** a responsive grid (1 column on phones, 2 on tablets, 3 on desktop). Each card has strong typography, a type badge, category tags, and one prominent "View jobs →" button.
- **Type:** a system font stack (no web-font download), with large, heavy headings.
- **Theme:** works in light and dark mode, following `prefers-color-scheme`.
- **Disclaimer (footer, always visible):** "Work At Hill is an independent directory and is not affiliated with or endorsed by the U.S. Air Force, the Department of Defense, or any listed employer."

## 4. Employer listings

### Fields shown on each card
| Field | Notes |
|---|---|
| Name | Required |
| Type | One of: `Prime contractor`, `Subcontractor / supplier`, `Federal civilian`, `Services / support`. Shown as a badge. |
| Description | One line (≤ 120 characters) about what they do *at Hill*, not a generic company tagline |
| Matches (only while searching) | "Matches: LO technician": the role, or live USAJOBS job title, that made this card match the search (see §5) |
| Job categories | 1–5 tags from a fixed list: `Trades & Maintenance`, `Engineering`, `Software & IT`, `Logistics & Supply`, `Admin & Business`, `Internships & Entry-level`, `Base services` (clinic, commissary, Exchange) |
| Primary link | "View jobs →" pointing to the careers page. If possible, the link is pre-filtered to Utah/Hill. |
| Secondary link (optional) | Federal employers only: the agency's own hiring page, if one exists |
| Open jobs (USAJOBS entries only) | "23 open jobs · checked Nov 6, 2026" ("1 open job", or "No open jobs right now" at 0), shown above "View jobs". It's fetched at build time and refreshed daily (see §4 *Open-job counts*). |
| Verified date | Small text: "Link verified Nov 2026" |
| Suggest a change | Small link to the recruiter feedback form, prefilled with the employer name (see §7) |

**Not shown in v1:** logos, clearance requirements, veteran/SkillBridge flags, and headcount (see §10).

### Federal / government employers
The primary link is a **USAJOBS search pre-filtered to the agency and the Hill AFB location**. The agency's own hiring page is the secondary link when one exists. Confirm the exact USAJOBS query-string format during the build by running the search on usajobs.gov and copying the resulting URL. Don't guess parameter names or agency codes.

### Open-job counts (USAJOBS)
- Each card whose primary link is a USAJOBS search (`https://www.usajobs.gov/search/results/`) shows its current open-job count. The count comes from the official [USAJOBS Search API](https://developer.usajobs.gov/api-reference/get-api-search) (`https://data.usajobs.gov/api/search`).
- **Requests:**
  - Headers: `Host: data.usajobs.gov`, `User-Agent: <USAJOBS_EMAIL>`, `Authorization-Key: <USAJOBS_API_KEY>`.
  - Each card's count is `SearchResult.SearchResultCountAll`, requested with `ResultsPerPage=1`.
- **The count must match the "View jobs" link.**
  - The API query is derived from that same URL: `l` → `LocationName`, `a` → `Organization`, `pp` → `JobGradeCode`. Several values are joined with `;`.
  - If the URL has any other parameter, the card shows **no** count rather than one that could disagree.
  - Checked against the live website on 2026-11-06: all 7 counts matched.
- **Build time only.** The browser never calls the API; the page's only third-party request is Google Analytics (§6).
- **Never breaks the site.** If the key is missing or rejected, the API is down, or a response is malformed, the build continues and those cards simply show no count.
- **The date** is the Mountain Time date the counts were fetched.
- **The API key and email are secrets.** They are never logged, printed or written into the page.

### Data file: `data/employers.json`
```json
{
  "bases": {
    "hill": { "name": "Hill AFB", "state": "UT", "path": "/" }
  },
  "employers": [
    {
      "id": "northrop-grumman",
      "base": "hill",
      "name": "Northrop Grumman",
      "type": "prime",
      "description": "Sentinel ICBM program engineering and integration in Roy and Clearfield.",
      "categories": ["engineering", "software-it", "trades-maintenance"],
      "jobsUrl": "https://…",
      "secondaryUrl": null,
      "verified": "2026-11",
      "sourceUrl": "https://…"
    }
  ]
}
```
- `roles` (required, 3–25 unique job titles in sentence case, each 2–60 characters) lists the common jobs and trades the employer hires for **at Hill**, e.g. "Aircraft painter", "IT specialist (network/infosec)". It's used by search and isn't listed on the card.
  - Each role needs evidence: USAJOBS postings at Hill (current or historic) for federal employers, or Hill-area job postings for contractors.
  - `data/ROLES-REVIEW.md` records the source and confidence of each role. Uncertain ones are flagged there for you to verify before launch.
- `sourceUrl` is internal and never shown on the page. It links to evidence (news, a contract award, an official page) that the employer has a workforce at Hill. It's required, so every listing can be traced back to its evidence.
- `base` lets one employer appear at several bases as separate records, each with its own local description and pre-filtered link.
- `type` and `categories` use slug values. A single map in the JS turns slugs into display labels.
- A JSON Schema (`data/employers.schema.json`) is checked in CI (see §8). Unknown types or categories, missing fields, and duplicate ids all fail the build.

### Seed data
I will draft ~25–40 employers: federal employers (e.g., Ogden Air Logistics Complex / OO-ALC and other units at Hill that hire civilians), prime contractors (e.g., Northrop Grumman, Boeing, Lockheed Martin, L3Harris), and major subcontractors and services firms. **You approve every entry before launch.** Each entry needs a working link and a Hill-specific description. Drop any employer that has no verifiable Hill/Northern Utah presence.

### Finding more employers (`data/CANDIDATES.md`)
- **Sources, searched systematically:**
  - USAspending.gov contract awards with place of performance at Hill AFB (ZIP 84056), ranked by value over the last 3 years.
  - A separate list for nearby ZIPs (Roy, Clearfield, Sunset, Layton, Kaysville, Ogden), counting only Air Force awards from Hill's contracting offices.
  - Falcon Hill Aerospace Research Park tenants, Utah Defense Alliance members, and on-base support employers.
- **Each candidate records:**
  - a source showing a Hill workforce
  - an official careers link
  - roles with evidence
  - confidence
  - a recommendation
- **Not added:** supply-only contractors (fuel, parts, software licenses) are left out because they have no Hill workforce. Construction contractors are flagged, since their crews are temporary.
- **Approval:** candidates wait in `data/CANDIDATES.md` until you approve them, and only then are they added to `employers.json`.

## 4a. Tabs, resume help and events

The page has three tabs below the hero: **Employers** (the default), **Resume help** and **Events**. Each tab shows a count.

- **Tabs and links:**
  - Without JavaScript, the tabs are plain links to three sections that are all visible.
  - With JavaScript, they're ARIA tabs: arrow keys move between them, and the open tab goes in the URL (`?tab=resume`, `?tab=events`), so Back works and a tab can be shared.
  - Old `#resume-help` / `#events` links open the right tab.
  - The hero search searches employers, so typing in it switches to Employers.
  - On phones under 400 px the count badges are hidden, so all three tabs fit.

### Resume help (`data/resources.json`)
- **Who is listed:**
  - Free help near Hill comes first: the base Military & Family Readiness Center, Utah Workforce Services job centers in Clearfield and Ogden, its veteran services, and Weber State, Davis Tech and Ogden-Weber Tech career centers.
  - Paid local resume professionals in Davis and Weber counties follow, under a note that Work At Hill doesn't endorse them and nobody pays to be listed.
  - National firms with "local" landing pages and Salt Lake County firms are left out.
- **Fields:**
  - `id`, `name`, `cost` (`free`/`paid`), `kind` (Military & family, State job center, Veterans, College career center, Private resume writer), `description` (≤160), `services` (1–6), `who` (eligibility), `city`, `url`, `verified` (YYYY-MM).
  - `sourceUrl` is internal, never shown, and required.
- **Approval:** `data/RESOURCES-REVIEW.md` records evidence and confidence, and you approve every listing.

### Events (`data/events.json`, `data/event-sources.json`)
- **Covers:** job fairs, resume workshops and meet-and-greets at Hill AFB or in Northern Utah (the same `data/locations.json` rule as §6). Types: Job fair, Workshop, Meet & greet.
- **Where events come from:**
  - **Curated events** in `data/events.json`, with `start` as `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` Mountain Time.
  - **Calendars read at every build:** public calendars using The Events Calendar REST API (Ogden-Weber Tech, Utah Veterans and Military Affairs, Air Force Civilian Service). An event is kept only if its title or category is job-related (`keywords`) and it's nearby, or its title names Hill AFB.
  - **The same polite reading rules as §6:** robots.txt first, a named user agent, timeouts. A failure only drops that calendar.
- **What shows:**
  - Past events drop off at each build (the daily deploy).
  - The same event listed twice is shown once.
  - A repeating series shows its next date with "repeats (N more dates)".
- **The Events tab** lists:
  - upcoming events (date, type, time, place, host, details link)
  - "Yearly events to watch for" (the `annual` list: the Hill AFB hiring event, Utah's virtual job fair, college fairs, the federal resume workshop)
  - links to more event calendars
  - when the calendars were last checked
  - When nothing is dated, it says so plainly rather than showing a blank list.
- **"Upcoming events" strip:** the Employers tab starts with up to 3 upcoming events and an "All events →" link to the Events tab.

## 4b. More ways to find Hill jobs (`data/programs.json`)
- **What's listed:** programs and job boards that cover many employers, for example Pathways searches at Hill on USAJOBS, DoD SkillBridge, the Utah Aerospace Pathway, ClearanceJobs' Hill AFB search, and Ogden-Weber Tech's public job board.
- **Where:** a section at the bottom of the Employers tab, after the employer grid. That keeps three tabs, which all fit at 320 px.
  - It's linked from the search empty state ("More ways to find Hill jobs ↓") and from the footer; both links open the Employers tab at the section.
  - Without JavaScript, it shows as part of the Employers section.
- **Each entry:** grouped by kind (Programs, Job boards, State services, On-base help, College job boards), A–Z, with a name link (new tab), a one-line "who it's for" (≤100 characters) and the month it was checked.
- **Fields:** `id`, `name`, `kind`, `who`, `url`, `verified` (YYYY-MM), and `sourceUrl`, which is internal and never shown. The build validates them.
- **No duplicates:** offices already on the Resume help tab appear here only for separate *job* help, such as a public job board.
- **Review sheet:** `data/PROGRAMS-REVIEW.md` holds the evidence and the maybe/skip list.

## 4b-2. Employer Directory (`/employers/`)

One shareable page listing every Hill employer, grouped by type (Prime contractors, Subcontractors & suppliers, Federal civilian employers, Services & support), A–Z within each group.

- **Built from `data/employers.json` at deploy time**, with the same cards as the homepage. Editing the JSON and pushing updates both pages. The page works without JavaScript.
- **Search box and type pills ("All" plus one per type):** `assets/directory.js` runs the shared search in `assets/search.js`. Groups with no matches hide, and the URL keeps `?q=` and `?type=` so a filtered view can be shared.
- **Layout:** one column under 640 px.
- **Linked from:** the homepage hero ("Employer Directory →") and the footer of every page.

## 4b-3. Employer pages (`/employers/<id>/`)

One page per Hill employer, so each one can be found in search ("Boeing jobs Hill AFB") and shared on its own.

- **Built from `data/employers.json`** by `renderEmployerPage` and `templates/employer.html`, on every deploy (including the daily rebuild). No JavaScript.
- **Contents:** breadcrumbs (Home › Employers › name, also as `BreadcrumbList` JSON-LD), type badge, the "View open jobs" button (plus the secondary link), what they do at Hill, kinds of work (`roles`) and category pills that open the home page filtered by that category, recent job titles read at build time (USAJOBS for federal cards, careers sites for contractors; up to 20, with the date checked), "Before you apply" tips (hiring guide, resume help, Get Trained for trade employers, events), up to 6 similar employers (share a category; same type breaks ties) and "Suggest a change".
- **Linked from:** every card's name, on the home page and the directory. Listed in `sitemap.xml` and sent to IndexNow after a push.
- **Still no `JobPosting` data:** titles are shown as plain text, never as job postings.

## 4b-4. Jobs by type (`/jobs/` and `/jobs/<id>/`)

One page per kind of work ("Aircraft mechanic jobs at Hill AFB"), so people searching for their trade or field find the site, plus an index at `/jobs/`.

- **Data:** `data/job-types.json`. Each type has an `id`, `name`, `group` (trades, tech, support), a short `intro`, `match`/`exclude` patterns (case-insensitive regular expressions tested against each employer's `roles`), an optional `category` (lists every employer with that category instead), `pay` (wg, gs or mixed, picks the pay tip), `trades` (adds the Get Trained link) and `related` types. The build checks every field, that each pattern compiles, that `related` ids exist and that each type matches at least one employer.
- **Each page:** breadcrumbs (+ `BreadcrumbList` JSON-LD), the intro, a card per employer, A–Z, with its matching roles (or its description for category types), up to 3 matching live job titles ("Open now", from USAJOBS or careers sites, same patterns) and "View jobs"; a dated total of matching openings; "Good to know" tips (pay, federal vs contractor, Get Trained for trades, resume help and job fairs); related job types.
- **Linked from:** the home hero ("Browse jobs by type"), the directory tagline, each employer page ("Browse by job type"), and every page's footer. Listed in `sitemap.xml` and sent to IndexNow after a push.
- **Adding a type:** add an entry to `data/job-types.json` and push. Keep `intro` to facts true for every employer it lists.

## 4c. How hiring at Hill works (`/how-hiring-works/`)
- **What it is:** a short, plain-language page (about 850 words) in five sections:
  - federal vs. contractor jobs
  - how pay works: GS ("Rest of U.S." locality), WG (Utah wage area 139), NH pay bands, and Service Contract Act pay for contractors
  - security clearances, including what "required" and "able to obtain" mean in postings
  - getting on base for an interview (REAL ID, plus a link to Hill's own visitor page)
  - veteran and military spouse preferences (including that veterans' preference doesn't apply under Direct Hire Authority, and VEVRAA for contractors)
- **Where:** its own page, built from `templates/guide.html` with no JavaScript. Linked from the hero ("New to Hill hiring? How it works →"), the footer and the Resume help tab.
- **Official sources only:**
  - Every fact links to a .gov or .mil page, and a test fails if any source link is on another domain.
  - `data/GUIDE-SOURCES.md` records each claim with its source URL and a short quote.
  - Claims without an official source are cut. Sites that block automated reading (hill.af.mil) are linked but not restated.
- **Kept current:**
  - The weekly link check covers every source link.
  - Re-check the facts each January, when the GS pay tables and WG schedules change, and update "Last checked" on the page.

## 4d. Get Trained (`/get-trained/`)
- **What it is:** schools, apprenticeships and funding that lead to trades jobs at Hill, in four sections (Fast certificates, Apprenticeships, Aircraft mechanic (A&P) schools, Paying for training) plus "More paths into Hill", which links to the existing More ways section, Resume Resources tab, hiring guide and Employer Directory instead of repeating them.
- **Where:** its own page, built from `templates/training.html` and `data/training.json`, with no JavaScript. Linked from the hero ("Get trained for a trade →") and every page's footer.
- **Each card:** provider, name, where, length, cost and credential when the school publishes them, an optional one-line note, a "Visit website" link (new tab) and the month it was checked. An optional `search` term adds "Hill jobs for “…” →", which opens the homepage search; the build fails if that term finds no employer by its researched `roles`.
- **Fields:** `id`, `section`, `name`, `provider`, `city`, `length`, `cost`, `credential`, `note`, `search`, `url`, `verified` (YYYY-MM), and `sourceUrl`, which is internal and never shown. `length`, `cost`, `credential`, `note` and `search` may be `null`. A top-level `checked` (YYYY-MM) is shown as "last checked".
- **Official sources only:** every figure is copied from the school's or program's own page, and `data/TRAINING-REVIEW.md` records the URL and what it said. Figures that aren't published are left out, never estimated.
- **Kept current:** the weekly link check covers every training link. Re-check costs and lengths each July, when tech colleges publish new-year tuition.

## 4e. About / For recruiters (`/about/`)
- **What it is:** a short page, written in a casual first-person voice, with four sections:
  - **Who's behind this:** Rob Smith, 10+ years in the aviation maintenance world, who built the site to put the Hill job search and its resources in one place. No current employer is named.
  - **How listings work:** free for job seekers, always; every employer listed free, A–Z, and nobody can pay to rank higher in the directory; any future sponsors clearly labeled and kept separate from the listings; links go straight to each employer's site or USAJOBS; the site never takes applications or resumes; only employers with evidence of a Hill workforce; daily USAJOBS refresh and a weekly link check; independent, not affiliated.
  - **For recruiters and employers:** the "Add or fix a listing" form (§7), on a navy panel with the anchor `#update`.
  - **Link to Work At Hill:** a copy-paste blurb with the live employer count and the site URL, for schools, job centers, recruiters and veteran groups.
- **Where:** its own page, built from `templates/about.html` by `renderAbout`. Linked from every page's footer, and reached from the card and recruiter links (§7). Listed in `sitemap.xml` and tagged for GA4 like the other indexable pages.

## 5. Search and filtering

Everything runs in the browser, with no server.

- **Search box** (in the hero): matches as you type, debounced (~100 ms). Type `/` on desktop to focus it. The rules live in `assets/search.js`, which the page and the tests share.
  - **What it searches:** each employer's name, description, researched `roles`, and the **live job titles** open when the site was built. Federal cards get theirs from USAJOBS; contractors get theirs from their own careers sites, limited to Hill AFB and Northern Utah (§6).
  - **Not searched:** category labels; the category chips do that.
  - **Normalizing:** case and accents are ignored. "A&P" equals "AP". Other punctuation splits words, and a hyphenated term like "F-35" is matched as one phrase.
  - **Whole words for short terms:** a term of 2 letters or fewer must match a whole word, so "LO" never matches "Lockheed" or "logistics", and "IT" never matches "its". Longer terms match the start of a word ("mech" → "mechanic"), never the middle.
  - **Multi-word searches:** every word must match (AND).
  - **Synonyms** (`data/synonyms.json`, editable):
    - Groups of equivalent terms, e.g. painter/paint/coater/coatings/LO/low observable/stealth coatings (LO is a painting/coating trade, so these are one group), networking/network/IT/cyber, admin/administrative/clerk/office/secretary.
    - A search word in a group matches whole words only (with a plural "s" for terms longer than 2 letters). It also matches the group's other terms, but only in roles and job titles, so "admin" doesn't match "F-16 program office".
  - **"Matches:" line:** while a search is active, each card shows why it matched ("Matches: LO technician", "Matches: open job “Aircraft mechanic”", or "Matches: description"). Name matches need no explanation.
  - **Required example searches:** "painter", "coater", "LO", "networking" and "admin" must each find at least one employer, with a "Matches:" line on every result. "painter" and "coater" must find the same employers. `node --test` prints what each one returns.
- **Filter chips**, shown below the hero in two rows:
  - **Type** (single-select, with "All" as the default)
  - **Job category** (multi-select; an employer matches if it has *any* selected category)
- Search and chips combine with AND.
- **Result count** is announced live ("12 employers") through an `aria-live="polite"` region.
- **Empty state**, instead of a blank page:
  - It names the search: "No employers list “painter” yet."
  - If the chips are hiding matches, it says so: "3 employers match “painter” if you clear the type and category filters."
  - It offers suggestion buttons (mechanic, engineer, IT, logistics) that run that search.
  - It links to the same keyword search for all federal jobs at Hill on USAJOBS (`https://www.usajobs.gov/search/results/?l=Hill%20AFB%2C%20Utah&k=<query>`; `k` was confirmed on usajobs.gov).
  - A "Clear search and filters" button resets everything.
- **State in the URL:** filters and the search term go in the query string (`?q=boeing&type=prime&cat=engineering`), so a filtered view can be shared or bookmarked. Back/forward should work.
- **Sort order:** alphabetical by name. No paid or featured placement in v1.
- On phones, the chip rows scroll horizontally inside their own container. The page itself never scrolls sideways.

## 6. Build and structure

**Plain HTML/CSS/JS plus JSON. No framework and no npm dependencies.**

```
/
├── index.html              Hill page (generated)
├── assets/
│   ├── styles.css
│   ├── search.js           search rules (shared with the tests)
│   └── app.js              search box, filters, URL state
├── data/
│   ├── employers.json
│   ├── employers.schema.json
│   ├── synonyms.json       search synonym groups
│   ├── job-sources.json    contractor careers sites read for live job titles
│   ├── locations.json      what counts as Hill AFB and Northern Utah
│   ├── resources.json      resume help listings (free and paid)
│   ├── events.json         curated events and yearly events to watch for
│   ├── event-sources.json  public event calendars read at build time
│   ├── RESOURCES-REVIEW.md evidence for resume help and events
│   ├── programs.json       "More ways to find Hill jobs" (PROGRAMS-REVIEW.md has the evidence)
│   ├── training.json       Get Trained page (TRAINING-REVIEW.md has the evidence)
│   ├── CANDIDATES.md       employers found but not yet approved
│   ├── GUIDE-SOURCES.md    official source and quote for every fact on the hiring guide
│   └── ROLES-REVIEW.md     evidence for each employer's roles
├── scripts/
│   ├── build.mjs           renders cards into the HTML per base, with USAJOBS counts (Node built-ins only)
│   ├── check-links.mjs     link checker (Node built-ins only)
│   ├── verify-page.mjs     automated phone checks in headless Chrome
│   ├── verify-usajobs.mjs  compares API counts with the live USAJOBS site (run by hand)
│   ├── weekly-email.mjs    builds the weekly email and creates it in Buttondown
│   └── lib/                usajobs.mjs (USAJOBS counts/titles), careers.mjs (contractor titles), events.mjs (event calendars), newsletter.mjs (weekly email), chrome.mjs (headless Chrome)
├── test/                   node --test unit and build tests
├── templates/base.html, employer.html, jobs.html, job-type.html, privacy.html, guide.html, training.html
└── .github/workflows/
    ├── deploy.yml
    ├── link-check.yml
    └── weekly-email.yml
```

- The generated pages are written to `dist/` (not committed), and that folder is what gets deployed.
- `build.mjs` validates the data, then writes the full card list into static HTML for each base. The directory therefore works **without JavaScript** and search engines can index it; `app.js` only adds search and filtering on top. This is the only build step, and it needs only Node 20+.
- **Contractor job titles at build time:** the build reads open job titles from each contractor's careers site. They're used only for search, and refresh with the daily build.
  - **Sources:** `data/job-sources.json` names each contractor's careers system (Eightfold, Workday, Phenom, Workable, ApplicantPro, an HTML list, or a Radancy sitemap). It also lists the contractors that aren't read, with the reason.
  - **Location:** `data/locations.json` defines "Hill AFB and Northern Utah": Hill AFB by name, or a listed Davis/Weber/Box Elder/Cache/Morgan County town together with Utah/UT. Salt Lake County is left out. A job counts if any of its locations qualifies.
  - **Polite reading:**
    - Every request first checks the site's robots.txt, and a disallowed path is never requested. A site that answers robots.txt with 401/403/5xx is skipped.
    - Requests identify as `WorkAtHill-JobTitles/1.0 (+https://workathill.com)`, run one at a time, once per build, with a 15 s timeout and a page cap.
    - Only titles and locations are kept, never full postings.
  - **Never breaks the site:** any failure drops that contractor's titles, and the build continues. `--no-careers` skips this step, and the tests use it.
  - **No counts on contractor cards:** each careers site's own filter differs from the Northern Utah rule, so a count could disagree with what "View jobs" shows (the same rule as §4).
- **USAJOBS job titles at build time:** the same API call that gets each count also returns the open job titles (up to 500). The titles are cleaned up (hiring-authority suffixes dropped, ALL-CAPS changed to sentence case) and embedded in the page's search data. They refresh with the daily build.
- **USAJOBS counts at build time:**
  - The build reads `USAJOBS_API_KEY` and `USAJOBS_EMAIL` from the environment: `.env` locally (git-ignored), repo secrets in CI.
  - `--no-counts` skips the fetch.
  - A missing key or a failed API call never fails the build.
- **Page weight budget:** under 100 KB transferred for the site's own files on the Hill page (HTML, CSS, JS, favicon). Google Analytics' gtag.js (about 184 KB compressed) is not counted, so a real visit transfers about 225 KB. The phone checks block GA so test runs never send fake visits.
- **Analytics:** Google Analytics 4 via gtag.js, ID in `data/site.json` → `analyticsId` (`null` = no tag). The tag sits immediately after `<head>` on every indexable page (base pages, `/employers/`, `/how-hiring-works/`, `/privacy/`), never on the noindex `/thanks/`. Don't also add the GTM container (it would double-count). The only other third-party request is an email signup form, which posts to Buttondown when someone submits it (§7a).
- **Meta:** `<title>`, meta description, Open Graph/Twitter tags with a static share image (`og.png`, 1200×630), a favicon, and a canonical URL. No `JobPosting` structured data: the site lists employers, not job postings.
- **Adding a base later:** add an entry to `bases` with a `path` (e.g., `/tinker/`) plus its employers, then run the build. The root stays the Hill page while the site is called Work At Hill.

## 7. Recruiter feedback

- **The form:** "Add or fix a listing" on the About page (§4e), sent through the same Web3Forms inbox as Let's Connect (§7b), so requests arrive at rob@workathill.com. No Google account or second service is needed. Fields:
  - What's this about? (`request`, required): Add my company / Fix a listing / Remove a listing / List my resume service / Add an event / Link to or partner with the site / Something else
  - Company or organization (`company`, optional)
  - Your name, Work email, Details (required)
  - The email subject reads "Listing request from workathill.com". The form uses the same spam guard and `/thanks/` redirect as Let's Connect.
- **Links into it (same tab):**
  - Each card's "Suggest a change" goes to `about/?topic=fix&company=<name>#update`.
  - The "Recruiter? Add or update your company" link, at the bottom of the home page (footer, above Let's Connect), goes to `about/?topic=add#update`.
  - A short script on the About page reads `topic` and `company` and fills them in. Without JavaScript the form still works; the person picks these fields themselves.
- **Fallback:** if `contact.web3formsKey` isn't set, the links use the optional Google Form in `site.json` → `form` (prefill URL, new tab). If neither is set, the links and the form are left out.
- **Workflow:** a request comes in → you check it → you edit `employers.json` (or ask Claude to) → push → the site redeploys. Nothing updates on the site automatically.

## 7a. Weekly email and saved-search alerts

Job seekers can sign up for one weekly email: new jobs near Hill, upcoming events, and new matches for any searches they saved. The site itself stores no emails.

- **Email service:** [Buttondown](https://buttondown.com). It stores the list, sends a confirmation email before adding anyone (double opt-in), and adds an unsubscribe link to every email. Free up to 100 subscribers, then paid. Its open/click tracking must be turned **off**: subscribers are never tracked through their email.
- **Settings:** `data/site.json` → `newsletter`:
  - `buttondownUsername`
  - `postalAddress`: required in every commercial email by CAN-SPAM; a PO box is fine.
  - `sendMode`: `draft` (default; you review each email in Buttondown and send it) or `send`.
  - Until both the username and the address are set, the signup forms are left off the page and the build prints a warning.
- **Signup forms:**
  - Plain HTML forms post straight to Buttondown's `embed-subscribe` endpoint in a new tab. That's a request only when the person submits.
  - Every signup gets the tag `weekly`.
  - **"Get weekly updates"** sits in the footer on every tab.
  - **"Email me new jobs for this search":** while a search is active, a box above the results offers an alert. With no results it reads "Nothing for “welder” right now. Want an email when a job shows up?"; with results it offers new postings. It adds the tag `search:<term>`, with the term normalized like the search (lowercase, accents and punctuation removed, ≤40 characters).
- **Privacy page** (`/privacy/`, from `templates/privacy.html`, filled by `renderPrivacy`):
  - A "Last updated" date (`PRIVACY_UPDATED` in `scripts/build.mjs`; change it whenever the wording changes).
  - Google Analytics (cookies) counts visits and employer-link clicks; nothing is sold; link to Google's opt-out add-on. If `analyticsId` is null, the short version says browsing collects nothing, but the template's GA bullets must be edited by hand.
  - The weekly-email section appears only while signup is live: signups keep only the email address and saved searches, held by Buttondown; how to confirm, unsubscribe and ask for deletion.
  - The Let's Connect section appears only while the contact form is live (section 7b).
  - Children: meant for adults; nothing knowingly collected from under-13s, and deleted on request.
  - Changes: the page and its date change first; while the weekly email runs, a change that affects subscribers is also mentioned there.
  - Contact: the Let's Connect form, plus the postal address once the weekly email is live; a placeholder only if neither is set up.
  - Linked from the footer and every signup form.
- **The weekly email** (`.github/workflows/weekly-email.yml`, Mondays 13:00 UTC, plus manual runs):
  1. It builds with `--snapshot`: this week's live job titles (USAJOBS and contractors) and upcoming events.
  2. "New jobs" means titles that weren't in last week's snapshot, which is kept as a workflow artifact for 35 days. The first run has no list.
  3. `scripts/weekly-email.mjs` reads subscribers' saved-search tags from the Buttondown API.
  4. It then creates **one** email for everyone:
     - events in the next month
     - new jobs by employer (up to 8 titles each, then "…and N more")
     - a section per saved search, wrapped in `{% if 'search:<term>' in subscriber.tags %}` so each person sees only their own; "No new matches this week" when none
     - the footer with the disclaimer, privacy link and postal address
  5. Alerts match new titles with the same search rules as the site (synonyms included).
  6. Without `BUTTONDOWN_API_KEY` (a repo secret), it only writes a preview, which is also kept as a workflow artifact.
- **Safety:**
  - Saved-search tags come from subscribers, so only tags exactly matching the normalized `search:<words>` form are used (at most 100). Anything else could inject template code into everyone's email.
  - Job titles and event text are HTML-escaped, and braces are encoded, so nothing from a careers site can act as template code.
  - The API key is never printed.

## 7b. "Let's Connect" contact form

A short form at the bottom of the home page (name, email, message) for questions, ideas and corrections. Messages go to **rob@workathill.com**.

- **Form service:** [Web3Forms](https://web3forms.com). It emails each message to the address its access key was created with, so that address never appears in the page. The free plan allows 250 messages a month.
- **Settings:** `data/site.json` → `contact.web3formsKey`. The key is meant to be public: it can only send messages to that one inbox. Until it's set, the form is left off the page and the build prints a warning.
- **How it sends:**
  - With JavaScript, `app.js` posts the message in the background and shows "sent" or "didn't send" under the button.
  - Without JavaScript, it's a plain HTML post, and Web3Forms returns the visitor to `/thanks/` (not indexed by search engines).
- **Spam:** Web3Forms' own filtering, plus a hidden `botcheck` field. If spam becomes a problem, hCaptcha can be added, but it loads a third-party script and the privacy page would need to say so.
- **Privacy:** the privacy page explains what's sent and how it's used, only while the form is live. Messages are never added to the weekly email list.

## 8. Hosting, CI and link upkeep

- **Hosting:** GitHub Pages from this repo, deployed with GitHub Actions on every push to `main` (`deploy.yml`: validate → build → upload artifact → deploy). The site is served at **https://workathill.com** through a custom domain on GitHub Pages:
  - Add a `CNAME` file containing `workathill.com`.
  - At the DNS registrar, point the apex record at GitHub Pages' A/AAAA records and point `www` at `<user>.github.io` with a CNAME.
  - Turn on "Enforce HTTPS" in the repo's Pages settings.
  - Verify the domain in the GitHub account settings so nobody else can claim it.
  - `www.workathill.com` redirects to the apex domain.
- **Sitemap and robots.txt:** the build writes `sitemap.xml` (every base page, `/employers/`, each `/employers/<id>/`, `/jobs/`, each `/jobs/<id>/`, `/how-hiring-works/`, `/privacy/`; not the noindex `/thanks/`; `<lastmod>` = build date) and `robots.txt` (allow all, plus the sitemap URL), both from `siteUrl`.
- **Validation on every push and PR:** schema check, duplicate-id check, all URLs must be `https://`, `node --test`, and the automated phone checks. Any failure blocks the deploy.
- **Daily refresh:** `deploy.yml` also runs on a daily schedule (13:15 UTC, about 6–7 am Mountain) to rebuild and redeploy with fresh open-job counts.
  - GitHub pauses scheduled workflows in a public repo after 60 days with no repo activity; re-enable it in the Actions tab if that happens.
- **IndexNow (Bing and other engines):** after each successful deploy from `main`, the `indexnow` job runs `scripts/indexnow.mjs`, which posts changed URLs to `https://api.indexnow.org/indexnow` so Bing doesn't have to wait for its next crawl.
  - A push sends every sitemap page; the daily rebuild sends only the home page, where the job counts and events change.
  - The key lives in `data/site.json` → `indexNowKey`. It's public by design: the build writes it to `/<key>.txt` so the engines can confirm the ping came from this site. Set it to `null` to turn IndexNow off.
  - No visitor data is sent, and a failed ping never fails the run. The result shows in the job log: 200/202 means accepted, and 403 means the key file wasn't found.
  - Bing Webmaster Tools was set up on 2026-11-25 by importing the site from Google Search Console.
- **Secrets:** add `USAJOBS_API_KEY` and `USAJOBS_EMAIL` as repository Actions secrets (e.g. `gh secret set USAJOBS_API_KEY`, which prompts for the value).
  - They're passed to the build step only for pushes, scheduled runs and manual runs, never for pull requests. PR builds run without counts.
- **Weekly link check** (`link-check.yml`, cron every Monday plus a manual trigger):
  - Requests every outbound link: each employer's `jobsUrl` and `secondaryUrl`, plus the resume help, "More ways" programs, Get Trained and event links. `--extra FILE` also checks a list under review, such as candidates. Uses HEAD and falls back to GET, follows redirects, and times out after 15 s. Sends a generic User-Agent such as `WorkAtHill-LinkCheck/1.0`.
  - Retries timeouts, 429s and 5xx errors (twice, with a short pause). Settings are in `data/link-check.json`.
  - Each link is **OK**, **Moved** (redirect to another domain: flagged for review, not broken), **Blocked** (bot protection: 401/403/429/999, a timeout after retries, a Cloudflare challenge or a Workday maintenance page), **Skipped** (a domain on the skip list that always blocks bots, e.g. careers.rtx.com, jobs.saic.com, hill.af.mil) or **Broken** (404/410, other 4xx/5xx, or a failed connection). Only Broken counts as a failure. The User-Agent stays the honest `WorkAtHill-LinkCheck/1.0`; it never pretends to be a browser.
  - If anything is Broken, the workflow opens or updates **one** GitHub issue titled "Broken links: <date>" that lists each employer, URL and status, without opening duplicates. When a later check finds nothing broken, it closes that issue with a comment. The run itself stays green either way (it only fails if the checker crashes); the report is also shown on the run's summary page.
  - Blocked and skipped links are listed in the report so they can be opened by hand in a browser now and then. Known false positives that were checked by hand can also go on `data/link-allowlist.json`.
- **Verified dates:** when you confirm a link, update `verified` in the data. The card shows month and year.

## 9. Accessibility

- Semantic HTML: a single `<h1>`, a `<main>` landmark, cards as `<article>` inside a list, and chips as `<button aria-pressed>`.
- Fully keyboard operable, with visible focus rings and logical tab order.
- Tap targets are at least 44×44 px.
- Respects `prefers-reduced-motion` (no animated motif when it's set).
- Meets WCAG 2.2 AA color contrast in both themes.
- Links that open in a new tab say so for screen readers ("opens in new tab").

## 10. Out of scope for v1

- Other bases' pages, and any base switcher in the UI (the data model is ready for them)
- Company logos and photos
- Clearance-required, veteran/SkillBridge, and headcount fields
- Individual job postings, job feeds, scraping, or third-party job APIs, **except** these, read at build time only:
  - open-job counts and titles from the official USAJOBS Search API (§4)
  - contractor job *titles* for search, read politely from public careers pages (§6)
  - job-related events from public event calendars (§4a)
- User accounts and saved employers (weekly email and saved-search alerts are in scope through Buttondown, §7a)
- Recruiter self-service editing, a CMS, or automatic updates from form submissions
- Featured, paid, or sponsored placement, for employers, resume professionals or events
- Analytics beyond Google Analytics 4 (§6), and email open/click tracking
- Map view, commute or distance filters
- Languages other than English
- A backend, database, or serverless functions

## 11. Open questions

1. **Name vs. expansion:** "Work At Hill" is specific to Hill. When a second base is added, should it get its own name (e.g., "Work At Tinker") on its own page or domain, or should the umbrella brand change? This doesn't block v1.
2. **Google Form owner:** which Google account owns the form and Sheet? The form's prefill URL is needed before launch.
3. **Repo visibility:** a public repo is needed for free GitHub Pages on a personal account.

**Decided:** the domain is **workathill.com** (see §8).

## 12. Verifying it works on a phone

The site isn't done until every check below passes.

### Automated (run locally and in CI where possible)
- [ ] Lighthouse **mobile** run (Moto G-class emulation, slow 4G) on the deployed URL: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95
- [ ] No horizontal page scroll at 320, 360, 390, and 414 px widths (Chrome DevTools device mode). Check `document.documentElement.scrollWidth <= window.innerWidth`.
- [ ] Hill page's own files under 100 KB, and no third-party requests besides Google Analytics (DevTools Network tab)
- [ ] With JavaScript disabled, all employers and links are still visible and usable
- [ ] Filtered-out cards are actually hidden on screen (checked by what's visible, not by the `hidden` attribute)
- [ ] The five example searches ("painter", "coater", "LO", "networking", "admin") each show employers with a "Matches:" line, and a nonsense search shows the helpful empty state
- [ ] `node --test` passes (USAJOBS mapping, failure handling, no credential leaks, rendering)
- [ ] `node scripts/verify-usajobs.mjs`: every card's open-job count equals the count on its live "View jobs" USAJOBS page
- [ ] Building without a key (or with a bad one) succeeds and gives the same page, just without counts
- [ ] The build log shows contractor job titles from every source in `data/job-sources.json`, and building with `--no-careers` (or with a careers site down) still succeeds
- [ ] Tabs: Employers, Resume help and Events switch, show in the URL, work with Back and arrow keys, all fit at 320 px, and all three sections show without JavaScript
- [ ] "More ways to find Hill jobs" shows only on the Employers tab, and the empty-state and footer links jump to it
- [ ] Email signup (checked on a `--site` preview build until Buttondown is set up):
  - no forms before setup
  - after setup: the footer form, and the search alert box with the right `search:` tag, in both the no-results and has-results states
  - contrast and 44 px tap targets pass (`VERIFY_DIST=… node scripts/verify-page.mjs`)
  - `node scripts/weekly-email.mjs --current … --dry-run` writes a correct preview
- [ ] The build log shows every event calendar read; past events are gone and a repeating series shows once; `--no-events` still shows curated and yearly events

### On real devices (deployed GitHub Pages URL, not localhost)
Test on at least **one iPhone (Safari)** and **one Android phone (Chrome)**. If you don't have one of them, use BrowserStack's free trial or a friend's phone.

- [ ] Page loads and looks right in portrait and landscape, with no clipped text and no content hidden under the notch or home indicator
- [ ] Tapping the search box opens the keyboard without the page zooming in (input font-size ≥ 16 px), and results update while typing
- [ ] Filter chips scroll sideways with a swipe, toggle on tap, and the result count updates
- [ ] Search and filters combine correctly. Example: type "Boeing", then tap "Engineering": the result shows or hides as expected.
- [ ] Empty state appears for a nonsense search, and "Clear filters" resets everything
- [ ] Opening a shared filtered URL (e.g., `?cat=trades-maintenance`) in a fresh tab shows the same filtered view
- [ ] Back button after changing filters restores the previous view
- [ ] "View jobs →" opens the careers page in a new tab for 5 randomly chosen employers, including at least 1 federal (USAJOBS) employer
- [ ] On a federal card, the "N open jobs" count matches the number of results the "View jobs" page shows
- [ ] "Suggest a change" opens the Google Form with Company prefilled
- [ ] Dark mode on the phone shows the dark theme, and it stays readable
- [ ] With VoiceOver (iOS) or TalkBack (Android) on, you can reach the search box, a chip, and a "View jobs" link, and the result count is announced
- [ ] Sharing the URL in a messaging app shows the Open Graph preview card

### Launch checklist
- [ ] You approved every seed employer entry
- [ ] You checked every role in `data/ROLES-REVIEW.md`, especially the ⚑ ones and the LO questions, and the groups in `data/synonyms.json`
- [ ] You approved every resume help listing and event source in `data/RESOURCES-REVIEW.md`
- [ ] You reviewed `data/TRAINING-REVIEW.md`, opened the ⚑ links in a browser, and decided on the Maybe list
- [ ] You reviewed `data/PROGRAMS-REVIEW.md` and marked each candidate in `data/CANDIDATES.md` add / fix / skip
- [ ] You read the hiring guide against `data/GUIDE-SOURCES.md`, opened the hill.af.mil visitor link in a browser, and replaced "PENDING" in `data/link-allowlist.json` with your name and the date
- [ ] `node scripts/check-links.mjs` passes for every outbound link: employers, resume help, programs and events
- [ ] Buttondown account created:
  - double opt-in on, open/click tracking off
  - `newsletter` settings in `data/site.json` filled in
  - the `BUTTONDOWN_API_KEY` repo secret added
  - a manual run of the weekly-email workflow left a draft in Buttondown that you reviewed
  - a test signup from the "no results" box arrived with its `search:` tag
- [ ] All links pass the link checker (or are on the reviewed allowlist)
- [ ] Footer disclaimer is present
- [ ] `USAJOBS_API_KEY` and `USAJOBS_EMAIL` repo secrets are set, and a manual deploy run logs `USAJOBS counts: 7/7`
- [ ] Google Form is live, with the prefill link tested
- [ ] Weekly link-check workflow ran at least once by manual trigger and opened a test issue for a deliberately broken URL. Then that test data is removed.
