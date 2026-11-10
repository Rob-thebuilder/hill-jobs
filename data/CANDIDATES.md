# Employer candidates: review sheet

Researched 2026-11-09 by four research agents plus a careers-link check.

**Status, 2026-11-09:** at your request, all 17 "Ready to add" employers were added to `employers.json` (the directory went from 23 to 40). Six of them also get live job titles: KBR/Trinzic, Booz Allen, The Aerospace Corporation, Draper and PARC/ServiceSource on Workday, and MITRE on Phenom; the other 11 are listed in `job-sources.json` "skipped" with the reason. Pelatron ("Needs a fix"), the weak ones and the maybes were **not** added.

## Summary
- **Ready to add: 17.** Each has an official careers link and durable evidence of a Hill workforce; every link was re-checked by script on 2026-11-09 (all loaded).
- **Needs a decision or fix: 1** (see "Needs a fix" below).
- **Weak or dropped: 8**: Hill evidence too thin or no current jobs.
- **Maybes: 15**: real Hill presence, but no jobs found or the work is temporary.
- **Already listed:** 13 of the top 80 contractors at ZIP 84056 are already in the directory.
- **Skipped:** 21 supply-only contractors (fuel, parts, software; no Hill workforce) and 16 construction contractors (temporary crews).
- **Utah Defense Alliance** gave nothing new: its member list is behind a login, and the public board roster only names Lockheed Martin.

**Watch-outs**
- KBR's careers site now redirects to a KBR/Trinzic splash page, so its card uses careers.trinzic.com.
- ClearanceJobs company pages load even with a wrong company name (showing a generic list), so the HX5, Tecolote and ASRC links were checked for the company name in the page title.
- Several careers sites only show results in a browser (Workday, SuccessFactors, Dayforce, Taleo), so "open now" counts came from their data feeds.
- STS Government Solutions and STS Systems Support are sister companies of the listed STS Systems Defense, which already links their shared hiring portal; you may want to widen that card instead of adding them.

## Ready to add (17)
### KBR (Trinzic) · $72M in Hill contracts (3 yrs)
- **Hill evidence:** https://careers.trinzic.com/us/en/job/R2129737
- **Careers:** https://careers.trinzic.com/us/en/search-results?keywords=Hill%20AFB (filtered to Hill/Utah) · platform: Phenom
- **Open near Hill now:** 3 near Hill (server-rendered Phenom data): USAF-PBL EPBL Lead Engineering Technician, Hill AFB (R2129737, posted ~14 days ago); Warehouseman, Ogden (R3000244, ~17 days); Warehouseman, Ogden (R3001049, today). Workday mirror: https://trinzic.wd115.myworkdayjobs.com/en-US/Trinzic_Careers (Utah search = 8 hits, 3 local)
- **Confidence:** high · ⚑ Left out in round 1 for thin Hill evidence; now confirmed.
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "kbr",
  "base": "hill",
  "name": "KBR (Trinzic)",
  "type": "services",
  "categories": [
    "engineering",
    "software-it"
  ],
  "roles": [
    "Reliability engineer",
    "Mechanical engineer (A-10 SPO)",
    "Sentinel modeling & simulation engineer",
    "Senior software engineer",
    "Principal systems security engineer",
    "Maintenance & reliability engineering manager (F-16)"
  ],
  "description": "Engineers supporting Air Force weapon-system program offices (A-10, F-16, Sentinel) at Hill AFB",
  "jobsUrl": "https://careers.trinzic.com/us/en/search-results?keywords=Hill%20AFB",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://careers.trinzic.com/us/en/job/R2129737"
}
```

### Southwest Research Institute · $42M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.swri.org/contact/locations
- **Careers:** https://resapp.swri.org/resapp/Job_Search_Results.aspx?TYPE=HOURLY · platform: custom SwRI resapp
- **Open near Hill now:** none found — 91 listings across TYPE=HOURLY and TYPE=SALARIED, none in Utah (locations are San Antonio, Oklahoma City, Dayton, Boulder, Warner Robins)
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "swri",
  "base": "hill",
  "name": "Southwest Research Institute",
  "type": "services",
  "categories": [
    "engineering",
    "trades-maintenance"
  ],
  "roles": [
    "Aerospace structures engineer",
    "Aerospace systems engineer",
    "Avionics technician (A-10)",
    "Avionics engineering technologist"
  ],
  "description": "On-base structural engineers and avionics techs supporting A-10 and T-38 aircraft life programs at Hill AFB",
  "jobsUrl": "https://resapp.swri.org/resapp/Job_Search_Results.aspx?TYPE=HOURLY",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.swri.org/contact/locations"
}
```

### Johns Hopkins APL · $36M in Hill contracts (3 yrs)
- **Hill evidence:** https://careers.jhuapl.edu/jobs/59005
- **Careers:** https://careers.jhuapl.edu/jobs?keywords=Hill%20AFB (filtered to Hill/Utah) · platform: iCIMS Jibe
- **Open near Hill now:** 1: On-Site Rad-Hard Electrical Engineer (Hill AFB, Utah), req 59005, posted 2026-05-15, still listed (JSON: https://careers.jhuapl.edu/api/jobs?keywords=Hill%20AFB). ClearanceJobs https://www.clearancejobs.com/jobs/johns-hopkins-university-applied-physics-laboratory/hill-afb-ut (200) shows the same 1 job.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "jhu-apl",
  "base": "hill",
  "name": "Johns Hopkins APL",
  "type": "services",
  "categories": [
    "engineering"
  ],
  "roles": [
    "Flight systems test engineer",
    "Lead engineer, systems engineering integration & test",
    "Rad-hard electrical engineer",
    "Strategic deterrent nuclear survivability analyst",
    "Missile navigation analyst",
    "Contractor program security officer"
  ],
  "description": "APL field office at Hill AFB with engineers and analysts supporting the Sentinel ICBM program",
  "jobsUrl": "https://careers.jhuapl.edu/jobs?keywords=Hill%20AFB",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://careers.jhuapl.edu/jobs/59005"
}
```

### HX5 · $30M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.clearancejobs.com/jobs/hx5-llc/utah
- **Careers:** https://www.clearancejobs.com/jobs/hx5-llc/utah (filtered to Hill/Utah) · platform: unknown
- **Open near Hill now:** 6 open in Ogden UT on ClearanceJobs: General/Interdisciplinary Engineer Senior (9300184, posted 2026-11-09), ISSO Senior (9272616), Equipment Specialist Senior (9143652), Electrical Engineer Journeyman (9105001), ISSO Journeyman (9101658), Electrical Engineer EPASS HB (8985586). Note: /jobs/hx5-llc/hill-afb-ut shows no cards and /jobs/hx5/hill-afb-ut shows other companies' jobs; use /utah.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "hx5",
  "base": "hill",
  "name": "HX5",
  "type": "services",
  "categories": [
    "engineering",
    "logistics-supply",
    "admin-business"
  ],
  "roles": [
    "Electrical engineer (C3BM)",
    "Program manager",
    "Logistics equipment specialist",
    "Technical order manager",
    "Security assistant",
    "Information system security officer",
    "Operations manager"
  ],
  "description": "Engineering, logistics and program support staff for Air Force program offices at Hill AFB",
  "jobsUrl": "https://www.clearancejobs.com/jobs/hx5-llc/utah",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.clearancejobs.com/jobs/hx5-llc/utah"
}
```

### PARC Community Partnership Foundation (ServiceSource) · $29M in Hill contracts (3 yrs)
- **Hill evidence:** https://defensedaily.com/contract-awards/contract-award-parc-community-partnership-foundation-clearfield-utah-92946958
- **Careers:** https://servicesourceinc.wd1.myworkdayjobs.com/en-US/ServiceSource_Staff?q=Hill (filtered to Hill/Utah) · platform: Workday
- **Open near Hill now:** 1: Lead Janitor, Hill AFB-UT (2026-9414, posted ~5 days ago) https://servicesourceinc.wd1.myworkdayjobs.com/en-US/ServiceSource_Staff/job/Hill-AFB-UT/Lead-Janitor_2026-9414 (200)
- **Confidence:** medium
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "parc-hill",
  "base": "hill",
  "name": "PARC Community Partnership Foundation (ServiceSource)",
  "type": "services",
  "categories": [
    "base-services",
    "internships-entry"
  ],
  "roles": [
    "Janitor / custodian",
    "Lead janitor",
    "Lead worker",
    "Janitorial supervisor",
    "Van driver (crew transport)"
  ],
  "description": "AbilityOne nonprofit providing custodial crews across Hill AFB buildings",
  "jobsUrl": "https://servicesourceinc.wd1.myworkdayjobs.com/en-US/ServiceSource_Staff?q=Hill",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://defensedaily.com/contract-awards/contract-award-parc-community-partnership-foundation-clearfield-utah-92946958"
}
```

### Resource Management Concepts · $25M in Hill contracts (3 yrs)
- **Hill evidence:** https://jobs.workable.com/jobs/d31331b7-9047-458c-85f8-e3e76c9049e9
- **Careers:** https://jobs.workable.com/companies/chjfRDfAfQJs9EQSR11s4h · platform: Workable
- **Open near Hill now:** 7 at 'Hill Air Force Base' of 30 total (from https://jobs.workable.com/jobs.md?companyId=5b5bad23-8ab3-42b6-9bfc-1b682f013886): Software Engineer Senior, Radar Technical Advisor, Configuration Manager, Computer Support Technician, Network Administrator, Network Administrator Senior, Information System Security Officer.
- **Confidence:** medium
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "rmc",
  "base": "hill",
  "name": "Resource Management Concepts",
  "type": "services",
  "categories": [
    "engineering",
    "software-it"
  ],
  "roles": [
    "Radar technician",
    "Radar technical advisor",
    "Network administrator"
  ],
  "description": "Radar and network technicians supporting the 84th Radar Evaluation Squadron at Hill AFB",
  "jobsUrl": "https://jobs.workable.com/companies/chjfRDfAfQJs9EQSR11s4h",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://jobs.workable.com/jobs/d31331b7-9047-458c-85f8-e3e76c9049e9"
}
```

### City Light & Power · $24M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.defensedaily.com/contract-awards/contract-award-city-light-power-inc-greenwood-village-colorado-23470368
- **Careers:** https://careers.jobscore.com/careers/clpinc · platform: JobScore
- **Open near Hill now:** none found — 15 JobScore listings, none at Hill (the location filter dropdown includes 'Hill Air Force Base, UT')
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "city-light-power",
  "base": "hill",
  "name": "City Light & Power",
  "type": "services",
  "categories": [
    "trades-maintenance"
  ],
  "roles": [
    "Journeyman lineman (maintenance electrical worker)",
    "Installation manager - electric utility",
    "Project manager - electric utility"
  ],
  "description": "Owns and runs Hill AFB's electrical distribution system; hires linemen and utility managers",
  "jobsUrl": "https://careers.jobscore.com/careers/clpinc",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.defensedaily.com/contract-awards/contract-award-city-light-power-inc-greenwood-village-colorado-23470368"
}
```

### Booz Allen Hamilton · $22M in Hill contracts (3 yrs)
- **Hill evidence:** https://bah.wd1.myworkdayjobs.com/en-US/BAH_Jobs/job/Hill-AFB-UT/Virtual-Desktop-Infrastructure-Engineer--Mid_R0253222
- **Careers:** https://bah.wd1.myworkdayjobs.com/en-US/BAH_Jobs?q=Hill%20AFB (filtered to Hill/Utah) · platform: Workday
- **Open near Hill now:** 1 located at Hill AFB: Virtual Desktop Infrastructure Engineer, Mid (R0253222, posted today). The 'Hill AFB' keyword search returns 23, but the other 22 are multi-location jobs elsewhere. ClearanceJobs https://www.clearancejobs.com/jobs/booz-allen-hamilton/hill-afb-ut (200) shows the same 1.
- **Confidence:** high · ⚑ Left out in round 1 for thin Hill evidence; now confirmed (1 current Hill job).
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "booz-allen",
  "base": "hill",
  "name": "Booz Allen Hamilton",
  "type": "services",
  "categories": [
    "engineering",
    "software-it",
    "logistics-supply"
  ],
  "roles": [
    "Virtual desktop infrastructure engineer",
    "Cybersecurity engineering analyst",
    "Aircraft maintenance and logistics analyst (F-35 depot)",
    "ICBM physical security systems engineer",
    "Electrical engineer",
    "Air vehicle component execution & induction manager"
  ],
  "description": "Engineers and analysts on base supporting Sentinel ICBM, F-35 depot planning and Hill IT systems",
  "jobsUrl": "https://bah.wd1.myworkdayjobs.com/en-US/BAH_Jobs?q=Hill%20AFB",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://bah.wd1.myworkdayjobs.com/en-US/BAH_Jobs/job/Hill-AFB-UT/Virtual-Desktop-Infrastructure-Engineer--Mid_R0253222"
}
```

### American Water (Military Services Group) · $17M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.waterworld.com/wastewater-treatment/article/16214894/american-water-awarded-water-wastewater-contract-for-utah-air-force-base
- **Careers:** https://jobs.amwater.com/ · platform: SAP SuccessFactors RMK
- **Open near Hill now:** not verifiable: search results render via JS (search/?q=Hill returns an empty shell). The candidate jobsUrl (req 1302043700, General Maintenance Worker SCA) now says 'You can't view this job because it's not available'.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "american-water-hill",
  "base": "hill",
  "name": "American Water (Military Services Group)",
  "type": "services",
  "categories": [
    "trades-maintenance",
    "admin-business"
  ],
  "roles": [
    "Water treatment plant operator",
    "General maintenance worker",
    "GIS technician",
    "Administrative assistant"
  ],
  "description": "Owns and operates Hill AFB's water and wastewater systems under a 50-year utility contract",
  "jobsUrl": "https://jobs.amwater.com/",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.waterworld.com/wastewater-treatment/article/16214894/american-water-awarded-water-wastewater-contract-for-utah-air-force-base"
}
```

### Command Cyber Solutions · $16M in Hill contracts (3 yrs)
- **Hill evidence:** https://phf.tbe.taleo.net/phf01/ats/careers/v2/viewRequisition?org=PFS&cws=51&rid=4376
- **Careers:** https://phf.tbe.taleo.net/phf01/ats/careers/v2/jobSearch?act=redirectCwsV2&cws=51&org=PFS · platform: Taleo Business Edition
- **Open near Hill now:** 4 'UT-Ogden' (Hill AFB data center) of 10 total: Senior Systems Administrator (rid 4376, HOT JOB), HPE Senior Systems Administrator (4401), Data Scientist Senior (4402), 'Command Cyber Job Opportunities' general pool (4229).
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "command-cyber-solutions",
  "base": "hill",
  "name": "Command Cyber Solutions",
  "type": "services",
  "categories": [
    "software-it"
  ],
  "roles": [
    "Senior systems engineer",
    "Computer systems engineer",
    "Computer hardware engineer",
    "Senior VMware engineer",
    "Cloud solutions architect",
    "Information systems security officer",
    "Security analyst",
    "Senior configuration manager"
  ],
  "description": "Runs IT operations, cloud and cybersecurity for Hill AFB's consolidated enterprise data center",
  "jobsUrl": "https://phf.tbe.taleo.net/phf01/ats/careers/v2/jobSearch?act=redirectCwsV2&cws=51&org=PFS",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://phf.tbe.taleo.net/phf01/ats/careers/v2/viewRequisition?org=PFS&cws=51&rid=4376"
}
```

### ASRC Federal (NetCentric Technologies) · $6.0M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.clearancejobs.com/jobs/asrc-federal/utah
- **Careers:** https://us242.dayforcehcm.com/CandidatePortal/en-US/asrcfh · platform: Dayforce
- **Open near Hill now:** 2 on ClearanceJobs: Site Manager (Ogden Air Logistics Complex, Hill AFB) 9300451, posted 2026-11-09; Booster Sustainment Engineer, Layton UT 9237016.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "asrc-federal-netcentric",
  "base": "hill",
  "name": "ASRC Federal (NetCentric Technologies)",
  "type": "services",
  "categories": [
    "software-it",
    "engineering"
  ],
  "roles": [
    "Junior software engineer",
    "Journeyman software engineer",
    "Senior software engineer",
    "Systems engineer",
    "Test engineer",
    "Technical writer"
  ],
  "description": "Software and test engineers on the A-10 flight software team at Hill AFB's 309th Software Engineering Group",
  "jobsUrl": "https://us242.dayforcehcm.com/CandidatePortal/en-US/asrcfh",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.clearancejobs.com/jobs/asrc-federal/utah"
}
```

### The Aerospace Corporation
- **Hill evidence:** https://www.fox13now.com/news/local-news/expanded-offices-to-help-deter-nuclear-threats-opened-thursday-at-hill-af-base
- **Careers:** https://aero.wd5.myworkdayjobs.com/en-US/External?q=Hill%20AFB (filtered to Hill/Utah) · platform: Workday
- **Open near Hill now:** 1: Industrial Security Specialist, Hill AFB UT (R017049, posted today) https://aero.wd5.myworkdayjobs.com/en-US/External/job/Hill-AFB-UT/Industrial-Security-Specialist_R017049 (200). The Sentinel engineer postings on CJ/Dice appear closed.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "aerospace-corp",
  "base": "hill",
  "name": "The Aerospace Corporation",
  "type": "services",
  "categories": [
    "engineering",
    "software-it"
  ],
  "roles": [
    "Sentinel SE&I Sr. Project Engineer",
    "Sr. Sentinel Payloads Engineer",
    "Sr. Guidance, Navigation and Control Engineer",
    "Software Acquisition Engineer",
    "Sr. Engineer - Solid Propulsion",
    "Booster Senior Aerospace/Mechanical Engineer"
  ],
  "description": "Federally funded R&D center engineers supporting the Sentinel ICBM program office at Falcon Hill.",
  "jobsUrl": "https://aero.wd5.myworkdayjobs.com/en-US/External?q=Hill%20AFB",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.fox13now.com/news/local-news/expanded-offices-to-help-deter-nuclear-threats-opened-thursday-at-hill-af-base"
}
```

### MITRE
- **Hill evidence:** https://careers.mitre.org/us/en/job/R117892
- **Careers:** https://careers.mitre.org/us/en/search-results?keywords=Hill%20AFB (filtered to Hill/Utah) · platform: Phenom
- **Open near Hill now:** 1: Cryptography and Nuclear Codes Engineer, Lead — 'Hill AFB - Clearfield, Utah' (R117892). The keyword search returns 6 hits, but the other 5 are at Wright-Patterson.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "mitre",
  "base": "hill",
  "name": "MITRE",
  "type": "services",
  "categories": [
    "engineering",
    "software-it",
    "admin-business"
  ],
  "roles": [
    "Facility Security Officer",
    "Nuclear Codes and Crypto Engineer Lead",
    "Sentinel Enterprise Engineer",
    "Multidisciplinary Systems Engineer",
    "Lead Communications Engineer",
    "Systems Engineer (Cryptography)"
  ],
  "description": "Nonprofit systems engineers supporting Air Force nuclear/Sentinel program offices from MITRE's Falcon Hill site.",
  "jobsUrl": "https://careers.mitre.org/us/en/search-results?keywords=Hill%20AFB",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://careers.mitre.org/us/en/job/R117892"
}
```

### Draper
- **Hill evidence:** https://www.draper.com/media-center/news-releases/detail/27315/draper-breaks-ground-on-new-building-at-hill-air-force-base
- **Careers:** https://draper.wd5.myworkdayjobs.com/en-US/Draper_Careers?q=Clearfield (filtered to Hill/Utah) · platform: Workday
- **Open near Hill now:** 4 located in Clearfield UT (search returns 16; the rest are Cambridge-led multi-location jobs): Senior Embedded Software Engineer JR002450, System Quality Engineer JR002749, Senior Mixed Signal Electronics Design Engineer JR002802, Distinguished System Requirements Engineer JR002983-1.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "draper",
  "base": "hill",
  "name": "Draper",
  "type": "subcontractor",
  "categories": [
    "engineering",
    "software-it"
  ],
  "roles": [
    "Senior Software Engineer",
    "Principal Digital Electronics Engineer",
    "Senior FPGA Design Engineer",
    "Senior Integration and Test Engineer",
    "Principal System Quality Engineer",
    "Program Manager / Program Director, Air Force & Missile Defe"
  ],
  "description": "Nonprofit R&D lab building a 30k+ SF engineering center at Falcon Hill (open fall 2026) for ICBM guidance work.",
  "jobsUrl": "https://draper.wd5.myworkdayjobs.com/en-US/Draper_Careers?q=Clearfield",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.draper.com/media-center/news-releases/detail/27315/draper-breaks-ground-on-new-building-at-hill-air-force-base"
}
```

### Tecolote Research
- **Hill evidence:** https://www.clearancejobs.com/jobs/tecolote-research/hill-afb-ut
- **Careers:** https://www.tecolote.com/careers/ · platform: custom in-house Angular careers app
- **Open near Hill now:** 2 on ClearanceJobs at Hill AFB: Operations Research Analyst (Intermediate Cost Analyst) 9185601 (posted 2026-09-22, validThrough 2026-11-22); Cost Analyst/Estimator (Mid-Senior) 9133692.
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "tecolote-research",
  "base": "hill",
  "name": "Tecolote Research",
  "type": "services",
  "categories": [
    "admin-business",
    "engineering"
  ],
  "roles": [
    "Budget Analyst (Junior)",
    "Senior Cost Analyst",
    "Journeyman Cost Analyst",
    "Senior Cost Engineer Analyst",
    "Schedule Analyst",
    "Construction Cost Engineer",
    "Cost Estimating Analyst"
  ],
  "description": "Cost-estimating and program-control analysts supporting Air Force program offices from Falcon Hill Bldg 1580.",
  "jobsUrl": "https://www.tecolote.com/careers/",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.clearancejobs.com/jobs/tecolote-research/hill-afb-ut"
}
```

### Summit Technologies
- **Hill evidence:** https://defensedaily.com/contract-awards/contract-award-summit-technologies-inc-navarre-florida-40000000
- **Careers:** https://app.trinethire.com/companies/20517-summit-technologies-inc/jobs · platform: TriNet Hire
- **Open near Hill now:** 1: Foreign Military Sales Subject Matter Expert — 'Hill AFB - Client Location' https://app.trinethire.com/companies/20517-summit-technologies-inc/jobs/125504-foreign-military-sales-subject-matter-expert (200)
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "summit-technologies",
  "base": "hill",
  "name": "Summit Technologies",
  "type": "subcontractor",
  "categories": [
    "software-it",
    "logistics-supply",
    "admin-business"
  ],
  "roles": [
    "Mission Planning Subject Matter Expert (MPSC)",
    "Mission Planning SME Team Lead",
    "Foreign Military Sales (FMS) Logistics Specialist",
    "FMS Subject Matter Expert",
    "Configuration Management Specialist",
    "MPC Software Test Engineer / QA",
    "System Support Representative"
  ],
  "description": "Veteran-owned small business HQ'd at Falcon Hill providing mission planning, FMS logistics and IT support.",
  "jobsUrl": "https://app.trinethire.com/companies/20517-summit-technologies-inc/jobs",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://defensedaily.com/contract-awards/contract-award-summit-technologies-inc-navarre-florida-40000000"
}
```

### Nurses Etc. Staffing
- **Hill evidence:** https://careerportal.nursesetc.net/jobs/192562/
- **Careers:** https://careerportal.nursesetc.net/jobs/ · platform: Sourceflow job board
- **Open near Hill now:** 1: Clinical Pharmacist, 75th Medical Group, Hill AFB — posted November 4, 2026 (own-domain URL; the sourceflow.co.uk URL serves the same page)
- **Confidence:** high
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "nurses-etc-staffing",
  "base": "hill",
  "name": "Nurses Etc. Staffing",
  "type": "services",
  "categories": [
    "base-services"
  ],
  "roles": [
    "Clinical Pharmacist",
    "Dental Hygienist",
    "Dental Assistant"
  ],
  "description": "Government-contract clinical staff (pharmacy, dental) at the 75th Medical Group clinic on Hill AFB",
  "jobsUrl": "https://careerportal.nursesetc.net/jobs/",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://careerportal.nursesetc.net/jobs/192562/"
}
```

## Needs a fix (1)
### Pelatron Technologies · $8.3M in Hill contracts (3 yrs)
- **Hill evidence:** https://www.pelatrontech.com/contact-us
- **Careers:** https://www.pelatrontech.com/careers · platform: ADP Workforce Now recruitment
- **Open near Hill now:** none found: the ADP WFN requisitions API (cid af40839a-…) returned 0 openings
- **Confidence:** medium · ⚑ You dropped Pelatron in review round 1. Listed again because it has a Hill help-desk contract.
- **Needs a fix before adding:** employer "pelatron".roles: needs at least 3 items
- **Your call:** ☐ add ☐ fix ☐ skip

```json
{
  "id": "pelatron",
  "base": "hill",
  "name": "Pelatron Technologies",
  "type": "services",
  "categories": [
    "software-it",
    "internships-entry"
  ],
  "roles": [
    "IT help desk support specialist",
    "Client systems technician"
  ],
  "description": "Help desk and client-systems technicians supporting Hill AFB computer users",
  "jobsUrl": "https://www.pelatrontech.com/careers",
  "secondaryUrl": null,
  "verified": "2026-11",
  "sourceUrl": "https://www.pelatrontech.com/contact-us"
}
```

## Weak or dropped after the careers-link check
| Employer | Verdict | Why |
|---|---|---|
| R2C | weak | No own careers site found. r2cinc.com is 'R2C Solutions, Inc.', an unrelated commercial IT firm with no Hill jobs. Only aggregator evidence, latest from Apr 2026. |
| APRO International | weak | Contract evidence for Hill PMEL task orders (incl. FY2025 AFEC PMEL II; award https://www.supplierdiversity.com/federal-spending/award/FA489023F0009/, 200), but no careers site and no current job. |
| Beacon Group | weak | The official board has no Hill posting; Hill evidence is aggregator-only (Laborer/Grounds at Hill AFB, 2025–2026). |
| DDC IT Services | drop | No current Hill evidence. The DISA mainframe contracts found don't name Hill/Ogden, and the only Hill posting is gone (410). |
| Leo Tech | drop | The official ApplicantPro board has no Utah jobs, and the only Hill evidence is an April 2025 career.com part-time AGE/GSE posting. (leotechllc.com is a parked domain; the real site is leotechusa.com.) |
| Filius Corporation | weak | Only one closed aggregator posting (Apr–Jun 2026) for an Air Force contract near Ogden; no durable Hill page. |
| Chickasaw Nation Industries (Occupational Medicine) | weak | The Hill AFB occupational-medicine contract FA820122C0003 (through Jan 2027) went to Chickasaw Business Solutions LLC; its tie to CNI isn't confirmed, a 2026 recompete solicitation exists, and the official board has no Utah jobs. |
| Space Dynamics Laboratory | weak | No current Ogden/Hill jobs on the official feed, and no durable SDL page found for an Ogden/Hill office. Evidence is past aggregator postings (C4ISR program manager, Ogden). |

## Maybes
| Employer | Hill contracts (3 yrs) | Confidence | Notes |
|---|---|---|---|
| HHI Corporation | $110M | medium | Construction (project-based crews), but local HQ and multi-year Hill IDIQ work. Postings hosted via Eide Bailly iCIMS; no official HHI careers page found. |
| Sabel Systems | $28M | uncertain | Only posting found is Beavercreek OH-based with 2-3 days/week onsite at WPAFB or Hill. Search summary says careers at sabelsystems.isolvedhire.com (not loaded). |
| Alaska Northstar Federal | $19M | uncertain | No web evidence of Hill-based staff or postings found in one search; recheck later. |
| PowerHouse Resources International | $14M | uncertain | Contract is clearly on-site labor, but web evidence is a single aggregator painter listing (per search summary); careers page not found. 'Aircraft mechanic' rol |
| Vangarde | $11M | medium | Evidence thin (two aggregator mentions); careers page not found. |
| SkyQuest Aviation | $9.8M | medium | Only Hill posting found is 2022 (7981 Georgia St, Hill AFB). FOM/transient-alert roles inferred from contract descriptions, not postings. Careers page not found |
| Advanced Systems Technology & Management | $7.4M | uncertain | No AST postings at Hill found in one search. |
| Argos Business Innovations | $6.5M | uncertain | No postings found in one search. |
| Lincoln Environmental Services | $5.3M | uncertain | Contract confirmed; no job postings or careers page found. Team size likely small. |
| Georgia Tech Research Institute (GTRI) | – | medium | Office verified (Bldg 1578 Suite 101) but small; only one Utah posting seen and its date unknown. Fewer than 3 distinct roles evidenced. |
| America First Credit Union | – | medium | The on-base presence is certain, but on-base hiring is low-volume and not separately advertised. The jobsUrl is one sample teller posting, location not verified |
| Boyer Hill Military Housing | – | medium | This is a real on-base employer, but no current postings or careers page were found. Evidence is from 2024 (older). It may use RealPage, since boyerhill.com lin |
| Blackson Arrow (BSH Management Service LLC) | – | medium | Only one role was found, and it has expired. DLA Energy is re-competing GOCO fuel services for Hill and 5 other bases (SPE603-26-R-0538), so the incumbent may c |
| CW Resources | – | uncertain | This is a small single-tenant contract, and no posting could be loaded or dated. Low priority. |
| Aerospace Heritage Foundation of Utah | – | medium | The museum is on base, though outside the gate. Paid hiring is tiny, but the internship is a nice entry-level item. Could fit as an internships-only listing; ot |

## Table 1: USAspending, place of performance Hill AFB (ZIP 84056), 2023-11-01 to 2026-11-09
Top 80 by contract obligations (185 recipients received over $1M in total).

| # | Recipient | Obligations | Work | Status |
|---|---|---|---|---|
| 1 | ADVANTAGED SOLUTIONS, LLC | $445M | on-site | skip |
| 2 | NORTHROP GRUMMAN SYSTEMS CORPORATION | $257M |  | already listed |
| 3 | THE BOEING COMPANY | $121M |  | already listed |
| 4 | HHI CORPORATION | $110M | construction | flag: construction |
| 5 | CACI, INC. - FEDERAL | $103M |  | already listed |
| 6 | STS SYSTEMS DEFENSE LLC | $83M |  | already listed |
| 7 | KBR WYLE SERVICES, LLC | $72M | on-site | add |
| 8 | AMENTUM SERVICES, INC. | $68M |  | already listed |
| 9 | SYSTEMS IMPLEMENTERS INC | $59M |  | already listed |
| 10 | SHOFAR COMMUNICATIONS LLC | $51M | construction | flag: construction |
| 11 | SOUTHWEST RESEARCH INSTITUTE | $42M | on-site | add |
| 12 | RHI LLC | $36M | construction | flag: construction |
| 13 | SAHARA PALMS INC | $36M | construction | flag: construction |
| 14 | THE JOHNS HOPKINS UNIVERSITY APPLIED PHYSICS LABORATORY LLC | $36M | on-site | add |
| 15 | SINCLAIR OIL CORPORATION | $32M | supply-only | skip: supply only |
| 16 | HX5 LLC | $30M | on-site | add |
| 17 | GEORGIA TECH APPLIED RESEARCH CORP | $30M | on-site | new |
| 18 | KEKOLU-RIO VISTA JOINT VENTURE, LLC | $30M | construction | flag: construction |
| 19 | PARC COMMUNITY PARTNERSHIP FOUNDATION | $29M | on-site | add |
| 20 | SABEL SYSTEMS TECHNOLOGY SOLUTIONS, LLC | $28M | on-site | maybe |
| 21 | STS GOVERNMENT SOLUTIONS, LLC | $26M | on-site | already listed |
| 22 | RESOURCE MANAGEMENT CONCEPTS, INC. | $25M | on-site | add |
| 23 | LEIDOS, INC. | $25M |  | already listed |
| 24 | CITY LIGHT & POWER, INC. | $24M | on-site | add |
| 25 | BOOZ ALLEN HAMILTON INC | $22M | on-site | add |
| 26 | ENGINEERING AND SOFTWARE SYSTEM SOLUTIONS, INC. | $20M |  | already listed |
| 27 | NVE-HHI JV | $20M | construction | flag: construction |
| 28 | DH TECHNOLOGIES, INC. | $20M | supply-only | skip: supply only |
| 29 | ALASKA NORTHSTAR FEDERAL, LLC | $19M | on-site | maybe |
| 30 | MSC INDUSTRIAL DIRECT CO., INC. | $18M | supply-only | skip: supply only |
| 31 | R2C LIMITED LIABILITY COMPANY | $17M | on-site | add |
| 32 | AMERICAN WATER OPERATIONS AND MAINTENANCE, LLC | $17M | on-site | add |
| 33 | FASTENAL COMPANY | $16M | supply-only | skip: supply only |
| 34 | AUTOMOTIVE & INDUSTRIAL SUPPLY, LLC | $16M | supply-only | skip: supply only |
| 35 | COMMAND CYBER SOLUTIONS LLC | $16M | on-site | add |
| 36 | APRO INTERNATIONAL, INC | $16M | on-site | add |
| 37 | SIEMENS GOVERNMENT TECHNOLOGIES INC | $16M | supply-only | skip: supply only |
| 38 | SGJV, LLC | $15M | construction | flag: construction |
| 39 | POWERHOUSE RESOURCES INTERNATIONAL LLC | $14M | on-site | maybe |
| 40 | PURE ENVIRO-MANAGEMENT, LLC | $13M | construction | flag: construction |
| 41 | WEST COAST JV, LLC | $13M | construction | flag: construction |
| 42 | WESTEST ENGINEERING CORPORATION | $12M | supply-only | skip: supply only |
| 43 | FED95 LLC | $12M | on-site | new |
| 44 | LOCKHEED MARTIN CORPORATION | $11M |  | already listed |
| 45 | HGL-APTIM JV LLC | $11M | on-site | new |
| 46 | STS SYSTEMS SUPPORT, LLC | $11M | on-site | already listed |
| 47 | VANGARDE LLC. | $11M | on-site | maybe |
| 48 | MICROSOFT CORPORATION | $11M | supply-only | skip: supply only |
| 49 | BEACON GROUP, INC. | $10M | on-site | add |
| 50 | DDC IT SERVICES LLC | $10M | on-site | add |
| 51 | MICHAEL BAKER INTERNATIONAL, INC. | $9.9M | construction | flag: construction |
| 52 | SKYQUEST AVIATION LLC | $9.8M | on-site | maybe |
| 53 | CV INTERNATIONAL, INC. | $9.7M | supply-only | skip: supply only |
| 54 | LEO TECH LLC | $9.2M | on-site | add |
| 55 | FILIUS CORPORATION | $8.4M | on-site | add |
| 56 | CARAHSOFT TECHNOLOGY CORP | $8.2M | supply-only | skip: supply only |
| 57 | IRON BOW TECHNOLOGIES, LLC | $8.2M | supply-only | skip: supply only |
| 58 | CHICKASAW BUSINESS SOLUTIONS, LLC | $7.6M | on-site | add |
| 59 | BRINKERHOFF EXCAVATING AND CONSTRUCTION, INC. | $7.5M | construction | flag: construction |
| 60 | MOTOROLA SOLUTIONS, INC. | $7.4M | supply-only | skip: supply only |
| 61 | ADVANCED SYSTEMS TECHNOLOGY & MANAGEMENT, INC. | $7.4M | on-site | maybe |
| 62 | MARIETTA NONDESTRUCTIVE TESTING LLC | $7.4M | supply-only | skip: supply only |
| 63 | PARAGON MICRO INC | $7.2M | supply-only | skip: supply only |
| 64 | CYKOR LLC | $6.9M | supply-only | skip: supply only |
| 65 | MILITARY INSTALLATION DEVELOPMENT AUTHORITY | $6.8M | construction | flag: construction |
| 66 | STERLING COMPUTERS CORPORATION | $6.6M | supply-only | skip: supply only |
| 67 | ARGOS BUSINESS INNOVATIONS LLC | $6.5M | on-site | maybe |
| 68 | UTAH DEPARTMENT OF WORKFORCE SERVICES | $6.4M | on-site | skip |
| 69 | NEW TECH SOLUTIONS, INC. | $6.4M | supply-only | skip: supply only |
| 70 | CLEAN HARBORS ENVIRONMENTAL SERVICES INC | $6.4M | supply-only | skip: supply only |
| 71 | NETCENTRIC TECHNOLOGY, LLC | $6.0M | on-site | add |
| 72 | CTI COMPANIES, LLC | $5.8M | construction | flag: construction |
| 73 | DOYON MANAGEMENT SERVICES, LLC | $5.5M | construction | flag: construction |
| 74 | RAYTHEON COMPANY | $5.4M |  | already listed |
| 75 | NH1 JV | $5.3M | construction | flag: construction |
| 76 | ADVANCED COMPUTER CONCEPTS, INC. | $5.2M | supply-only | skip: supply only |
| 77 | FLATWATER PROFESSIONAL SERVICES COMPANY | $5.1M | supply-only | skip: supply only |
| 78 | NORTHROP GRUMMAN SYSTEMS CORP | $4.7M |  | already listed |
| 79 | ARCHITECTURAL DESIGN WEST PC | $4.6M | construction | flag: construction |
| 80 | FEDERAL PRISON INDUSTRIES, INC | $4.4M | supply-only | skip: supply only |

## Table 2: nearby ZIPs, Air Force awards from Hill contracting offices only
| ZIP | Recipient | Obligations | Status |
|---|---|---|---|
| 84067 | NORTHROP GRUMMAN SYSTEMS CORP | $8.3B | already listed |
| 84041 | THE BOEING COMPANY | $314M | already listed |
| 84041 | KIHOMAC INC | $76M | already listed |
| 84015 | ENGINEERING AND SOFTWARE SYSTEM SOLUTIONS, INC. | $42M | already listed |
| 84401 | AUTOMOTIVE & INDUSTRIAL SUPPLY, LLC | $24M | new |
| 84015 | ENGINEERING AND SOFTWARE SYSTEM SOLUTIONS, INC. | $16M | already listed |
| 84015 | NORTHROP GRUMMAN SYSTEMS CORPORATION | $13M | already listed |
| 84067 | NORTHROP GRUMMAN SYSTEMS CORPORATION | $11M | already listed |
| 84404 | RICHARD MANUFACTURING COMPANY | $9.8M | new |
| 84405 | BORSIGHT, INC | $9.0M | new |
| 84041 | PARAGON MICRO INC | $8.5M | new |
| 84015 | PELATRON TECHNOLOGIES LLC | $8.3M | new |
| 84041 | MARK G. MILLER, INC | $7.2M | new |
| 84015 | NORTHROP GRUMMAN SYSTEMS CORPORATION | $6.0M | already listed |
| 84401 | LINCOLN ENVIRONMENTAL SERVICES, INC. | $5.3M | new |
| 84015 | PARC COMMUNITY PARTNERSHIP FOUNDATION | $3.0M | new |
| 84015 | SHOFAR COMMUNICATIONS LLC | $2.3M | new |
| 84040 | ENGINEERING AND SOFTWARE SYSTEM SOLUTIONS, INC. | $1.2M | already listed |

## Table 3: Falcon Hill Aerospace Research Park and Utah Defense Alliance
Falcon Hill has no public tenant list; tenants were found by building address in job postings, company location pages and the Ogden-Weber Chamber directory. About 5,500 people work in the park (Utah Business, Sep 2025).

| Company | Found via | Recommendation | Confidence | Notes |
|---|---|---|---|---|
| The Aerospace Corporation | falcon-hill | add | high | 6002 Wardleigh Rd (Bldg 1578). ~38 staff in 2022 with space to triple. aerospace.org pages returned 403 to fetch; careers portal is Workday  |
| MITRE | falcon-hill | add | high | Address from search snippet of mitre.org/locations (page itself 403'd): 6002 Wardleigh Rd, Bldg 1578, Suite 104. Job postings say 'MITRE Fal |
| Draper | falcon-hill | add | high | Groundbreaking Apr 22, 2025; workforce 100+ planned. Postings list Clearfield, UT. Better jobsUrl would be Draper's official careers page (d |
| Space Dynamics Laboratory | falcon-hill | add | high | Bldg 1578 Suite 105 per Ogden-Weber Chamber directory snippet. Also large HQ in North Logan (Cache County) - within Northern Utah scope; hir |
| Tecolote Research | falcon-hill | add | high | Address 6008 Wardleigh Rd, Bldg 1580, Ste 304 from Indeed posting snippet and LinkedIn snippet. Official careers page not loaded. |
| Summit Technologies | falcon-hill | add | high | Corporate HQ 6006 Wardleigh Rd, Bldg 1575, per search snippets of summittech.us contact page and Sep 2025 capabilities statement (pages 403' |
| Georgia Tech Research Institute (GTRI) | falcon-hill | maybe | medium | Office verified (Bldg 1578 Suite 101) but small; only one Utah posting seen and its date unknown. Fewer than 3 distinct roles evidenced. |

## Table 4: on-base and support employers
| Employer | Category | Recommendation | Confidence | Notes |
|---|---|---|---|---|
| ServiceSource / PARC Community Partnership Foundation | custodial (base support) | add | high | Contract FA8201-24-D-0015 has a $92.9M ceiling (Aug 2024 to Feb 2031) and covers Hill AFB, Little Mountain and UTTR Oasis. Hiring prioritize |
| Nurses Etc. Staffing | medical contract staffing | add | high | This is the most consistently active 75 MDG contract staffer found. The listed type of 'services' is the closest fit. The careers index URL  |
| America First Credit Union | credit union | maybe | medium | The on-base presence is certain, but on-base hiring is low-volume and not separately advertised. The jobsUrl is one sample teller posting, l |
| Boyer Hill Military Housing | housing privatization | maybe | medium | This is a real on-base employer, but no current postings or careers page were found. Evidence is from 2024 (older). It may use RealPage, sin |
| Blackson Arrow (BSH Management Service LLC) | base fuel contractor | maybe | medium | Only one role was found, and it has expired. DLA Energy is re-competing GOCO fuel services for Hill and 5 other bases (SPE603-26-R-0538), so |
| CW Resources | custodial (tenant facility) | maybe | uncertain | This is a small single-tenant contract, and no posting could be loaded or dated. Low priority. |
| Aerospace Heritage Foundation of Utah | museum | maybe | medium | The museum is on base, though outside the gate. Paid hiring is tiny, but the internship is a nice entry-level item. Could fit as an internsh |
| Hill AFB Dining Facility contractor (Utah DWS / Randolph-Sheppard) | food service (DFAC) | skip | uncertain | The actual operating vendor or teaming partner and the hiring entity are unknown. Revisit if the operator can be identified. |
| Robinson Waste Services | refuse | skip | medium | The contract is small (about $4.7M over 5 yr) and ends around Oct 2026. A successor solicitation went out in 2026. Drivers are based off bas |
| Smiley's Kitchen Mediterranean Grill | food service (Exchange concession) | skip | medium | Too small, and there's no hiring channel. |

**Already covered by existing cards**
- **Family Child Care (FCC) providers**: covered by 75th FSS. The FSS FCC office certifies providers, who are self-employed in-home caregivers (6 certified), not hired staff.
- **Mountain View Inn / Hill lodging**: covered by 75th FSS. Housekeeping, guest services, supply and accounting are NAF positions posted on USAJOBS by 75 FSS NAF HR.
- **Exchange restaurants (Burger King, Charleys, Subway, Taco Bell, Arby's, Popeyes), micro markets**: covered by AAFES. They are posted as Exchange jobs (e.g., 'Food Service Worker - Burger King' and 'Food Service Foreman - Charleys' on military spouse job boards).
- **Bowling/golf food service**: covered by 75th FSS. These are NAF cook and food service worker postings.
- **TRICARE office / Referral Management**: covered by 75th Medical Group. It is staffed by 75 MDG. TriWest administers TRICARE West, but no on-site staff were found.
- **Fuels Management Flight**: covered by Air Force civilian jobs (75th ABW). The 75 LRS fuels flight is AF military/civilian. Contract fuels work is the Blackson Arrow candidate.
- **Air Force Aid Society, chapel, legal**: covered by Air Force civilian jobs (75th ABW). These are delivered via the A&FRC and military/AF civilian staff.
- **Hill Aerospace Museum curators/director**: covered by Air Force civilian jobs. It is an Air Force museum (AF-funded). Only foundation staff are separate.

## How this was researched
- **USAspending.gov:** the API's recipient ranking for contracts (award types A–D) by place-of-performance ZIP. Each new recipient's top awards were read to classify the work as on-site, construction or supply-only.
- **Nearby ZIPs:** limited to Department of the Air Force awards from Hill's contracting offices.
- **Falcon Hill and the Utah Defense Alliance:** the park's and developer's pages, news, building-address searches, and the UDA's public pages.
- **On-base employers:** credit unions, child care, medical, food service, NAF, the museum, schools, housing, fuel and custodial.
- **Careers links:** checked separately for every "add" candidate, preferring the employer's own careers site filtered to Hill or Utah.
- **Gaps:** hill.af.mil, aerospace.org and mitre.org block automated reading, so facts from them came from search results. Subcontractors don't appear in USAspending at all (e.g., Tactical Air Support has many Hill aircraft-mechanic postings but no direct contract).
