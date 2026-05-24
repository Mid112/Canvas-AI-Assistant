
# CAPSTONE PROJECT TEAM CHARTER

## 1. TEAM NAME AND MEMBERS

### Team Name:Team 16

| Full Name | Student Number | Primary Role |
|---|---|---|
| Mridul Nohria | 74243379 | Backend Lead / DevOps / QA Lead |
| Jessica Goel | 41224841 | Backend Developer / Frontend Lead / Integration Lead |
| Bao Tran | 97274047 | Backend Developer / Documentation |
| Yerdana Maulenbay | 24831786 | Documentation / QA Lead |
| Rhythm Trivedi | 41908864 | Frontend Developer / DevOps |

### Self-Assessed Skills

#### Mridul Nohria
- Python
- REST APIs
- Database Design
- Agile Workflows

#### Jessica Goel
- Python
- Java
- JavaScript
- TypeScript
- SQL
- HTML
- CSS
- React
- Next.js
- Node.js
- Django
- Expo
- Supabase
- MySQL
- Git/GitHub
- Tableau
- pandas
- scikit-learn
- REST APIs

#### Bao Tran
- React
- CSS
- Accessibility Standards
- UI/UX Design

#### Rhythm Trivedi
- Python
- Java
- JavaScript
- SQL
- HTML/CSS
- React
- UI/UX Design
- Accessibility Standards

#### Yerdana Maulenbay
- Python
- PyTorch
- RAG
- LoRA/PEFT
- Pydantic

## 2. MISSION STATEMENT / PROJECT GOAL

We are collaboratively designing, developing, testing, and deploying a secure, AI-powered web application that assists instructors in managing selected Canvas LMS course activities through a natural-language conversational interface.

Managing a course in Canvas requires navigating multiple menus, settings, and workflows that are time-consuming and often unintuitive for instructors. Our application removes that friction by allowing instructors to interact with Canvas using plain conversational language — asking questions, making updates, and retrieving information the same way they would ask a colleague — reducing administrative overhead and allowing instructors to focus more on teaching.

### Why This Project Matters

This system aims to improve:

- Workflow efficiency
- Instructor productivity
- Course organization
- Communication with students
- Visibility into course activity and submissions

## 3. TEAM GOALS

### Academic Goals

- Achieve a final project grade of **85% or higher** across both terms
- Successfully integrate a Large Language Model (LLM) with the Canvas LMS API
- Implement secure authentication and data handling practices appropriate for an academic environment
- Apply and demonstrate:
  - Full-stack development
  - AI/LLM integration
  - API design
  - DevOps workflows
- Ensure consistency of values and argument types being passed to and retrieved from the LLM
- Publish all work on GitHub with:
  - Clean commit history
  - Proper documentation
  - CI/CD pipelines
- Sharpen frontend and backend development skills across the team
- Learn and apply:
  - Dockerization
  - Deployment workflows
  - Refactoring techniques
  - Testing strategies
  - Version control best practices

### Collaboration Goals

- Maintain respectful and constructive communication
- Ensure every member contributes meaningfully throughout the project
- Stay on or ahead of schedule whenever possible
- Maintain prompt response times
- Deliver work consistently and meet deadlines
- Give and receive constructive feedback professionally
- Clearly communicate and document major decisions
- Address blockers early rather than silently absorbing them
- Be prepared for and actively participate in meetings

### Deliverables and Milestones

- Finalize and merge the Team Charter via Pull Request
- Submit requirements specification and system design
- Complete Canvas API integration and LLM conversational interface prototype
- Finish security review and testing phase
- Deploy the final application and complete final presentation/demo
- Avoid last-minute submissions by targeting internally reviewed early delivery
- Ensure all team members participate in testing before major deliverables

## 4. ROLES AND RESPONSIBILITIES

### Backend Lead
**Bao Tran / Mridul Nohria / Jessica Goel**

#### Responsibilities
- Coordinate backend architecture and implementation
- Track deadlines and project progress
- Maintain GitHub Projects board
- Communicate with the instructor when necessary
- Write weekly project updates


### Frontend Lead
**Jessica Goel / Rhythm Trivedi**

#### Responsibilities
- Own UI/UX implementation using React
- Ensure responsive and accessible design
- Lead frontend design decisions
- Maintain consistency across frontend components


### DevOps / QA Lead
**Mridul Nohria / Yerdana Maulenbay**

#### Responsibilities
- Maintain CI/CD pipelines
- Configure deployment environments
- Create and execute testing workflows
- Enforce quality assurance standards

### Documentation Lead
**Bao Tran / Yerdana Maulenbay**

#### Responsibilities
- Maintain:
  - SRS documentation
  - README files
  - API documentation
  - Meeting notes
- Ensure deliverables are complete and submitted on time


### Integration Lead
**Rhythm Trivedi / Jessica Goel**

#### Responsibilities
- Manage branch integration and merge workflows
- Coordinate integration testing
- Ensure frontend and backend systems connect properly


### Role Flexibility

Roles will be reviewed periodically as the project progresses. Team members are encouraged to learn outside their primary area and contribute across the stack whenever possible. The team values adaptability and collaborative learning.


## 5. WORKING NORMS AND EXPECTATIONS

### Communication Tools

| Tool | Purpose |
|---|---|
| Discord | Primary Communication |
| Email | Formal Communication |
| GitHub | Version Control & Project Management |
| Google Docs | Shared Documentation |


### Response Expectations

- Respond within 24 hours whenever possible
- Communicate blockers or scheduling conflicts early
- Maintain professionalism in all communication


### Meetings

- Weekly meetings every Saturday or Sunday at 7pm
- Additional meetings scheduled as required

Members are expected to:
- Attend on time
- Come prepared
- Participate actively


### Repository and Development Conventions

#### Git Workflow

- Follow Git Flow practices
- One issue → one branch
- No direct commits to `main` or `develop`
- All changes must go through Pull Requests


#### Branch Naming Convention

```text
feature/short-description
bugfix/short-description
docs/short-description
````

#### Commit Standards

Use clear imperative commit messages.

Example:

```bash
Add assignment analysis endpoint
```


### Pull Requests / Code Reviews

* Every Pull Request requires at least 1 approval
* Major features require 2 approvals
* Include screenshots when applicable
* Use line-by-line review suggestions when reviewing code
* PR authors are responsible for resolving comments before merging
* Reviewers should respond promptly


### Integration Rules

* Only Integration Leads may merge major integration branches into production branches
* Tasks move to “In Review” only when a Pull Request is opened


### Task Management

GitHub Projects Board will be used for:

* Sprint planning
* Task tracking
* Issue management
* Progress monitoring

Each task should include:

* An assignee
* A due date
* Clear acceptance criteria



### Accommodating Different Working Styles

* Team members may work asynchronously outside meeting times
* Results and accountability matter more than fixed hours
* Team members should feel comfortable asking questions or requesting help
* The team prioritizes over-communication over assumptions


## 6. CONFLICT RESOLUTION PLAN

### Resolving Disagreements

#### Step 1 — Direct Discussion

The involved members discuss the issue respectfully and attempt resolution collaboratively.

#### Step 2 — Team Mediation

If unresolved, the issue is discussed during a dedicated team meeting.

#### Step 3 — Instructor Escalation

If the issue remains unresolved, the instructor may be contacted for mediation.


### Handling Underperformance or Unresponsiveness

* Members should communicate early if struggling
* The team will support members whenever possible
* Continued lack of participation will first be addressed privately
* Repeated issues may be escalated to the instructor if necessary


## 7. DECISION-MAKING PROCESS

* Consensus is preferred for major architectural and scope decisions
* Majority vote may be used when consensus cannot be reached
* Technical leads may make urgent implementation decisions when required
* Important decisions will be documented for transparency


## 8. ACCOUNTABILITY AND COMMITMENT

All members agree to:

* Attend scheduled meetings whenever possible
* Complete assigned work before internal deadlines
* Review Pull Requests promptly
* Communicate delays early
* Contribute consistently throughout the project lifecycle


### Missed Responsibilities

* First occurrence → discussed internally
* Repeated occurrences → documented and escalated if needed

Equitable contribution does not necessarily mean identical work, but rather fair participation relative to workload and responsibilities.


## 9. REVIEW AND REVISION

This charter will be reviewed:

* At major project deliverables
* Mid-project checkpoints
* Whenever significant team changes occur


### Responsibility for Updates

**Jessica Goel** will coordinate charter revisions and updates.

All revisions must be reviewed and agreed upon by the team.


## 10. OTHER PROCESSES AND PROCEDURES

### Scope of Work

* The project is scoped as a web-based application
* Native mobile applications are out of scope
* Deferred “Won’t Have v1” features remain outside the current project scope


### Work Schedule

* Estimated contribution:

  * ~20 hours per member per week
* Heavy workload periods should be communicated early


### Team Rituals

At the end of each sprint or milestone:

* Discuss:

  * What went well
  * What could improve
  * What should change next
* Celebrate major deliverables and completed milestones


### Documentation Standards

* Meeting notes stored in `/docs`
* Major decisions documented with:

  * Date
  * Participants
  * Outcome


## 11. AGREEMENT

By approving this charter, each team member confirms they understand and agree to the expectations, responsibilities, and processes outlined above.

This document serves as the team’s collaborative agreement for the duration of the capstone project.

| Team Member       | Student Number | Date         |
| ----------------- | -------------- | ------------ |
| Bao Tran          | 97274047       | May 21, 2026 |
| Mridul Nohria     | 74243379       | May 21, 2026 |
| Jessica Goel      | 41224841       | May 21, 2026 |
| Rhythm Trivedi    | 41908864       | May 21, 2026 |
| Yerdana Maulenbay | 24831786       | May 21, 2026 |


## 12. TIPS FOR TEAM SUCCESS

* Communicate openly and respectfully
* Ask for help early when needed
* Keep documentation updated
* Prioritize teamwork over perfection
* Stay adaptable as project requirements evolve
* Focus on consistent progress rather than last-minute work


