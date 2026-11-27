# Resume help and events: review sheet

Researched 2026-11-08. **You approve every listing before launch.** The rules for listing:
- Free services are listed first, then paid local professionals.
- Every listing carries the same independence disclaimer.
- No paid or featured placement.

## Resume help (`data/resources.json`)

| Listing | Free/Paid | Confidence | Evidence and notes |
|---|---|---|---|
| Hill AFB Military & Family Readiness Center | Free | high | [Hill AFB article](https://www.hill.af.mil/News/Article-Display/Article/397845/employment-help-is-available-at-airman-and-family-readiness-center) on free resume reviews; [Military OneSource page](https://installations.militaryonesource.mil/military-installation/hill-afb/military-and-family-support-center/employment); Bldg 150, 801-777-4681. ⚑ The article is old (2011), and the center has since been renamed. Confirm the services are current. |
| Workforce Services – Clearfield Employment Center | Free | high | [Two-page federal resume workshop](https://lcecon.laytoncityutah.gov/?p=9183) held there; 1290 E 1450 S. ⚑ The link goes to the North region workshops page, which looks out of date (COVID-era text). |
| Workforce Services – Ogden Employment Center | Free | high | 480 27th St. [DWS press release](https://jobs.utah.gov/department/press/2026/010526.html) mentions coaching, workshops, and resume and interview help. Same link caveat. |
| Workforce Services Veteran & Military Employment | Free | high | [jobs.utah.gov/veteran](https://jobs.utah.gov/veteran/): free live online civilian-resume workshops for veterans, service members and spouses |
| Weber State Career Services | Free | high | [weber.edu/careerservices](https://www.weber.edu/careerservices); for students and alumni |
| Davis Tech Career Placement Services | Free | high | [Official page](https://www.davistech.edu/career-placement-services): appointments and walk-ins for resume and cover letter reviews |
| Ogden-Weber Tech Student Success Center | Free | high | [Official page](https://www.otech.edu/current-students/student-success-center/job-coach/): resume review, interview practice, job board |
| Empire Resume | Paid | ⚑ medium | Ogden-area listings on [Yelp](https://www.yelp.com/biz/empire-resume-ogden) and BBB (serving Davis and Weber counties). The [website](https://www.empireresume.com/) has military and federal resume guides. Reviews are positive but come from competitor sites. Pricing from about $249 (unverified). |
| Notus Human Capital | Paid | ⚑ medium | BBB lists Farmington and Kaysville addresses, A+ rating, "resume services, career counseling". The [website](https://getnotus.com/) presents a career management and outplacement firm. Confirm they write resumes for individuals, not only for companies' outplacement. |

### Online resume builders (added 2026-11-27)

| Listing | Free/Paid | Confidence | Evidence and notes |
|---|---|---|---|
| USAJOBS Resume Builder | Free | high | [USAJOBS help: how to build a resume](https://help.usajobs.gov/how-to/account/documents/resume/build): sign in, "Build resume", add each section. [Page-limit FAQ](https://help.usajobs.gov/faq/application/documents/resume/page-limit): "Federal agencies only accept resumes up to two pages", and USAJOBS won't build or upload a longer one. [Military OneSource](https://militaryonesource.mil/education-employment/for-service-members/building-your-federal-resume) also points service members to it. |
| Utah Workforce Services Resume Builder | Free | high | [jobs.utah.gov Job Search Tools](https://jobs.utah.gov/jobseeker/js.html) lists "Resume Builder" (sign-in) plus a resume outline, critique form and examples (PDFs). [mydoorway.utah.gov Job Support](https://mydoorway.utah.gov/job-support): "Create an account or sign in … to access our resume builder tool." Free is not stated on the page; DWS job services are free. |
| CareerOneStop Resume Guide | Free | ⚑ medium | U.S. Department of Labor. The guide ([readable copy](https://cloudfront.careeronestop.org/JobSearch/Resumes/ResumeGuide/Introduction.aspx)) offers "a step-by-step plan for what to include in your resume", tips, samples and templates. It's a guide, not a form that makes the resume for you. ⚑ The listed www.careeronestop.org link blocks automated checks: open it in a browser, and add it to `link-allowlist.json` if the weekly link check flags it. |

**Builders left out:** commercial resume builders (Indeed, Canva, Zety and similar). Most are free to start but push paid plans or collect resumes; add one only if you want to.

**Left out:**
- National firms with "local" landing pages: ARC Resumes, ClearPoint, Snap Editing, TopResume.
- Firms based in Salt Lake City or Utah County: Upword Resume, Wasatch Career Services, Paradise Writing, Five Strengths.
- Fiverr and other freelance marketplaces.

**Ask:** do you know local resume professionals to add, especially ones who write federal and USAJOBS resumes?

## Events (`data/events.json` + calendars in `data/event-sources.json`)

**Read automatically every build.** robots.txt allows all three. Only job-related events (job, career, hiring, resume, interview, networking, meet-and-greet…) at Hill AFB or in Northern Utah are kept.
- [Ogden-Weber Tech events](https://www.otech.edu/events/): its fall career fairs (Nov 2–5, 2026) just passed.
- [Utah Veterans and Military Affairs events](https://veterans.utah.gov/events/): Davis County veteran entrepreneur networking (Nov 20, Kaysville) and monthly Warrior Revival military networking in Ogden.
- [Air Force Civilian Service events](https://afciviliancareers.com/events/): this is where the Hill AFB hiring event is posted. The current listings are online or out of state, so none show yet.

**Curated dated events** (checked 2026-11-25):
- **Utah Statewide Virtual Job Fair, Jan 14, 2027**: listed in Workforce Services' outreach report ([utah.gov PMN PDF](https://www.utah.gov/pmn/files/1497469.pdf), [jobs.utah.gov outreach PDF](https://jobs.utah.gov/workforce/wddoutreach.pdf)). Confidence high.
- **Weber State Spring Career & Internship Fair, Jan 20, 2027, 10 a.m.–2 p.m., Shepherd Union Ballrooms**: [Career Services events](https://www.weber.edu/careerservices/events/). The page's heading still reads "Spring 2026 Events", but the dates on it are 2027. Confidence high.
- **Davis Tech Career Fair, Wed Mar 10, 3:30–6:30 p.m., Davis Tech Main Building, Kaysville**: [career fair page](https://davistech.edu/calendar/career-fair/). The page shows no year. Mar 10 is a Wednesday in 2027 (it was a Tuesday in 2026), and the fall 2026 fair (Oct 14) has already happened. Confidence medium-high; recheck in January.

**Still no 2027 date:** the Hill AFB hiring event (not on afciviliancareers.com or jobs.utah.gov/hillafb yet), the next Ogden Community Job Fair, and the March statewide virtual fair.

Add events to `data/events.json` (or tell me) as they're announced.

**Yearly events to watch for:** Hill AFB/OO-ALC hiring event, Utah Statewide Virtual Job Fair, Ogden Community Job Fair, Hill AFB Area Veterans Job Fair, MINO, Davis Tech Career Fair, Weber State fairs, Ogden-Weber Tech career fairs, and the two-page federal resume workshop.
- **Ogden Community Job Fair** (added 2026-11-25): Compass Career Fairs at The Monarch, Ogden. Past dates: Jan 28, 2025, May 6, 2025, Sep 30, 2025, May 2026, and Jul 14, 2026 ([Layton City calendar](https://www.laytoncityutah.gov/LC/CommunityCalendar/Event/5724), [UPR calendar](https://www.upr.org/community-calendar/event/ready-set-hired-ogden-community-job-fair-30-local-companies-20-05-2026-21-11-57)). compasscareerfairs.com couldn't be read by the automated check; open it by hand.
- **Hill AFB Area Veterans Job Fair** (added 2026-11-25): RecruitMilitary + DAV at the Davis Conference Center, Aug 8, 2024 ([RecruitMilitary](https://my.recruitmilitary.com/events/hill-afb-area-veterans-job-fair-august-8-2024)) and Sep 4, 2025 ([DEA listing](https://www.dea.gov/events/2025/2025-09/2025-09-04/recruitmilitary-hill-afb-area-veterans-job-fair)). No 2026 fair found.
- **MINO** (added 2026-11-25): Hill M&FRC + Workforce Services, Feb 11, 2025, at The Landing, for service members, spouses and veterans with base access ([Utah Veterans and Military Affairs](https://veterans.utah.gov/event/military-informational-network-outreach-mino-event-hill-afb/)). Only one year confirmed; drop it if no 2027 date appears by March.

**Looked at and left out:**
- Acceler8 Wasatch Week: a business expo; Hill HR ran one career awareness session there in May 2024, and no later Hill session was found.
- Weber State Summer Job Fair: summer and part-time student jobs, and its dates conflict between pages (Feb 24, 2027 vs. Mar 19/26).
- Warrior Revival military networking (monthly, Ogden): already pulled in automatically from the Utah Veterans and Military Affairs calendar.

**Not used:**
- Third-party aggregators (JobFairX, allevents.in, Eventbrite listings). Their organizers and venues couldn't be verified.
- Workforce Services' workshop PDFs, which now require a state login.
