CAPSTONE PROJECT TEAM CHARTER

1. TEAM NAME AND MEMBERS
Team Name: Team 16
Full Name
Student Number
Primary Role
[Mridul Nohria]
[#74243379]
Backend Lead/DevOps / QA Lead
[Bao Tran]
[97274047]
Backend developer / Documentation
Jessica goel
41224841
Backend developer/frontend lead/integration lead
[Yerdana Maulenbay]
[#24831786]
Documentation / QA Lead
Rhythm Trivedi
41908864
Frontend developer/DevOps 

Self-Assessed Skills: 
[Mridul Nohria] — [ Python, REST APIs, database design, agile workflows] 
Jessica:Python, Java, JavaScript, TypeScript, SQL, HTML/CSS, React, Next.js, Node.js, Django, Expo, Supabase, MySQL, Git/GitHub, Tableau, pandas, scikit-learn, and REST APIs.
[Bao Tran] — [e.g., React, CSS, accessibility standards, UI/UX design] 
[Rhythm Trivedi] — [Python, Java, JavaScript, SQL, HTML/CSS, React, UI/UX design, accessibility standards] 
[Yerdana Maulenbay] — [Python, Pytorch, RAG, LoRA/PEFT, Pydantic]

2. MISSION STATEMENT / PROJECT GOAL
We are collaboratively designing, developing, testing, and deploying a secure, AI-powered web application that assists instructors in managing selected Canvas LMS course activities through a natural-language conversational interface.
This matters because managing a course in Canvas requires navigating multiple menus, settings, and workflows that are time-consuming and often unintuitive for instructors. Our application removes that friction by allowing instructors to interact with Canvas using plain conversational language — asking questions, making updates, and retrieving information the same way they would ask a colleague — reducing administrative overhead and letting instructors focus on teaching.


3. TEAM GOALS
Academic Goals:
Achieve a final project grade of 85% or higher across both terms.
Successfully integrate a large language model (LLM) with the Canvas LMS API in a final deliverable application.
Implement secure authentication and data handling practices appropriate for an academic environment, handling real course data.
Apply and demonstrate full-stack development, AI/LLM integration, API design, and DevOps skills.
Ensure the consistency of values and types of arguments being passed to and retrieved from the LLM
Publish all work on GitHub with a clean, documented commit history and maintain CI/CD pipelines throughout the project.
Collaboration Goals:
Maintain respectful, constructive communication at all times.
Ensure every team member has meaningful, visible contributions across both terms.
Address blockers early — raise issues in the team channel rather than absorbing them silently.
Deliver every milestone on time by setting internal deadlines 24 hours ahead of official ones.
Key Milestones (update dates as course schedule is confirmed):
End of Week 1: Team charter finalized and merged via PR.
[Date]: Requirements specification and system design submitted.
[Date]: Canvas API integration and LLM conversational interface prototype complete.
[Date]: Security review and testing phase complete.
[Date]: Deployed application and final presentation.

4. ROLES AND RESPONSIBILITIES
Backend Lead (Bao Tran/Mridul Nohria/Jessica Goel) — Coordinates meetings, tracks deadlines, communicates with instructor, maintains GitHub Projects board, writes weekly status updates.
Frontend Lead (Jessica Goel/Rhythm) — Owns the UI/UX implementation (React), ensures mobile responsiveness and WCAG 2.1 AA accessibility compliance, leads design decisions.
DevOps / QA Lead (Mridul Nohria/Yerdana Maulenbay) — Sets up and maintains CI/CD pipelines, manages deployment environment, writes and runs tests (unit, integration), enforces code review standards.
Documentation Lead (Bao Tran/Yerdana Maulenbay) — Maintains the SRS, README, API documentation, and meeting notes. Ensures all deliverables are submitted correctly and on time.
Integration Lead( Rhythm,jessica goel) — Manages the Git workflow and branch merging, leads integration pairing sessions, and ensures all features connect seamlessly across the full stack. 
Note on rotation: Roles will be reviewed at the midpoint of each term. Any member may request a role adjustment with team consensus. All members are expected to contribute to both frontend and backend code regardless of primary role.

5. WORKING NORMS AND EXPECTATIONS
Communication Tools:
Primary: Discord for daily communication.
Secondary: Email for instructor communications and formal submissions.
Response time expectation: reply to messages within 24 hours on weekdays; best effort on weekends.
Meeting Schedule:
Weekly team meeting: [Saturday, 7pm, Discord link] — mandatory unless prior notice given.
Quick async check-in posted to the team channel on every Tuesday [github/discord].
Ad-hoc meetings scheduled with at least 24 hours' notice when possible.
Git and Code Conventions:
Repository: GitHub — https://github.com/UBCO-COSC499-S2026/capstone-team-16.
Branching model: Git Flow — feature branches off development; main is production-only.
Branch naming: feature/short-description, bug-fix/short-description, docs/short-description.
Commit messages: imperative present tense, e.g., "Add ISBN lookup API integration."
No direct commits to main or develop. All changes via pull request.
Code Review / PRs:
Every PR requires at least one approval before merging. Two approvals required for major features.
PR author is responsible for resolving all comments before merging.
Reviewers must respond to PRs within 48 hours.
The team charter itself must be merged via PR with all four members reviewing as formal sign-off.
Task Management:
GitHub Projects (Kanban board) used for all tasks.
Every task must have an assignee and a due date before work begins.
Tasks are moved from "In Progress" to "In Review" only when a PR is open.
Accommodating Different Working Styles:
Team members may work async outside meeting times — results matter more than hours.
Anyone who needs a different communication style or accommodation should raise it in the first week.
No judgment for asking questions; the team defaults to over-communication.

6. CONFLICT RESOLUTION PLAN
Step 1 — Direct conversation: the parties involved discuss the issue openly and attempt to resolve it themselves within 48 hours.
Step 2 — Team mediation: if unresolved, the full team discusses the issue in a dedicated meeting. The project manager facilitates; all perspectives are heard before a resolution is proposed.
Step 3 — Instructor involvement: if the conflict cannot be resolved internally, the team contacts the course instructor for guidance. This is not a failure — it is the appropriate escalation path.
Handling underperformance or unresponsiveness:
If a member misses two consecutive check-ins or deadlines without communication, the project manager reaches out privately first.
If the issue continues, the team documents the pattern and raises it with the instructor.
Workload redistribution may be required and will be reflected in peer evaluations.

7. DECISION-MAKING PROCESS
Day-to-day technical decisions: the lead for that area decides after informing the team.
Significant design or scope decisions: discussed as a group; consensus preferred.
If consensus cannot be reached after reasonable discussion: majority vote (3 of 4).
Any decision that changes the project scope, tech stack, or timeline must be agreed upon by all four members and documented in the meeting notes.

8. ACCOUNTABILITY AND COMMITMENT
All members commit to attending scheduled meetings. Absences must be communicated at least 2 hours in advance.
Deliverables assigned to an individual are due by the agreed internal deadline — typically 24 hours before the official submission deadline to allow for review.
If someone cannot meet a deadline, they notify the team as early as possible so workload can be adjusted.
Repeated missed deadlines (3 or more) without communication will be formally noted and reported to the instructor as part of peer evaluation.
All members agree to contribute equitably. "Equitably" does not mean identically — it means everyone carries a fair share relative to the overall workload.

9. REVIEW AND REVISION
This charter will be reviewed at the midpoint of Term 1 and again at the start of Term 2.
The Documentation Lead is responsible for proposing updates.
Any revision must be agreed upon by all team members and merged via PR, with all members reviewing the changes.
Version history will be maintained in the repository.

10. OTHER PROCESSES AND PROCEDURES
Scope of Work:
The project is scoped to a web-based application only. Native mobile apps are explicitly out of scope for this capstone.
Features deferred to "Won't Have v1" in our SRS (digital lending, payment processing) are not in scope.
Work Schedule:
The team agrees to an estimated contribution of 20 hours per member per week.
Heavy workload periods (midterms, other course deadlines) will be flagged in advance so the team can plan accordingly.
Rituals:
End of each sprint/milestone: brief retrospective — what went well, what didn't, what changes next.
Celebrate submissions: small acknowledgment when a major deliverable is completed.
Documentation standards:
All meeting notes are stored in the /docs folder of the repository.
Every major decision is recorded with the date, attendees, and outcome.

11. AGREEMENT
By signing below, each team member confirms they have read, understood, and agree to the terms of this charter. This document serves as our social contract for the duration of the capstone project. Agreement is formalized by each member reviewing and approving the charter PR on GitHub.
[Bao Tran] — Student #[97274047] — Date: May 21, 2026
[Mridul Nohria] — Student #[74243379] — Date: May  21, 2026
Jessica Goel — Student #41224841 — Date: May 21, 2026
[Rhythm Trivedi] — Student #41908864 — Date: May 21, 2026
[Yerdana Maulenbay] - Student #[24831786] — Date: May 21st, 2026
