# PROJECT PLAN-TEAM 16  
## Safe AI-Powered Canvas Workflow Assistant
# 1. TEAM INFORMATION
## Team Number
**Team 16**
## Team Members
| Full Name | Primary Role |
|---|---|
| Mridul Nohria | Backend Lead / DevOps / Architecture |
| Jessica Goel | Frontend Lead / Integration Lead / Backend Developer |
| Bao Tran | Backend Developer / Documentation |
| Yerdana Maulenbay | AI/LLM Integration / Validation |
| Rhythm Trivedi | Frontend Developer / QA / Accessibility |
# 2. PROJECT OVERVIEW
## Project Title
**Safe AI-Powered Canvas Workflow Assistant**
# 3. PROJECT PURPOSE / JUSTIFICATION (UVP)
Modern Learning Management Systems such as Canvas provide extensive functionality for assignments, grading, communication, analytics, and student management. However, instructors frequently spend excessive time navigating through complex interfaces to complete repetitive administrative workflows.

Common tasks such as:
- identifying missing submissions,
- tracking late assignments,
- drafting reminder messages,
- analyzing student participation,
- reviewing assignment trends,
- and creating assignment configurations
  
often require navigating through multiple pages, filters, and menus.

This creates several real-world problems:

- instructor administrative overload,
- inefficient workflow management,
- repetitive manual communication,
- fragmented analytics,
- and reduced time available for teaching and student support.

## Our Solution

The Safe AI-Powered Canvas Workflow Assistant is a secure web application that enables instructors to interact with Canvas LMS using natural-language conversational requests.

Instead of manually navigating through Canvas, instructors will be able to issue conversational commands such as:

- “Show students missing Assignment 3”
- “Generate reminder messages for late submissions”
- “Summarize Quiz 2 performance trends”
- “Draft a homework assignment due Friday”
- “Show students below 50% on the midterm”

The system uses a locally hosted/downloaded Large Language Model (LLM) to:

- interpret instructor intent,
- retrieve relevant Canvas information,
- generate structured Canvas API queries,
- create workflow previews,
- and assist instructors with administrative workflows.

# Unique Value Proposition (UVP)

Unlike traditional LMS dashboards or autonomous AI systems, this project emphasizes:

## 1. Conversational AI Workflow Assistance
Instructors interact with Canvas workflows using natural language rather than navigating complex interfaces manually.

## 2. Final Decision in the Hands of Human Users
The system never autonomously executes high-impact actions. All generated workflows are always stored, and instructors can access previous snapshots at any time.

## 3. Accessible Previews of Changes
Every generated action, query, workflow recommendation, or message draft is previewed before approval.

## 4. Privacy-Focused Local AI
The MVP prioritizes locally hosted/downloaded LLMs using Ollama to reduce dependency on external cloud AI providers and improve data privacy.

## 5. Transparent & Explainable AI
All generated queries, recommendations, and workflows are inspectable, logged, and explainable.

# MVP Design Philosophy

The MVP intentionally prioritizes:

- workflow planning,
- query generation,
- previews,
- analytics,
- and instructor oversight

rather than autonomous execution of Canvas modifications.

This design:

- reduces security risks,
- improves explainability,
- simplifies deployment complexity,
- avoids unintended LMS modifications,
- and positions AI as a decision-support assistant rather than an autonomous system.

# 4. HIGH-LEVEL PROJECT DESCRIPTION

## Minimum Viable Product (MVP)

The MVP will be a secure web-based application integrating:

- Canvas LMS APIs,
- a local LLM,
- a conversational dashboard,
- workflow preview generation,
- and audit logging.

The system will include:

- secure authentication,
- course retrieval,
- assignment retrieval,
- submission analysis,
- conversational AI interaction,
- AI-generated workflow previews,
- dry-run validation,
- and Dockerized deployment.

# High-Level System Architecture

```text
React Dashboard (Frontend)
            ↓
FastAPI Backend
            ↓
Local LLM via Ollama
            ↓
Dockerized MCP Server
            ↓
Canvas REST API
````

# System Layers

## 1. Frontend Dashboard Layer

Provides:

* conversational chat interface,
* workflow visualization,
* submission analytics,
* preview panels,
* history logs,
* and dashboard summaries.

### Technologies

* React
* TypeScript
* Tailwind CSS
* shadcn/ui


## 2. Backend API Layer

Responsible for:

* authentication,
* API orchestration,
* token security,
* workflow validation,
* audit logging,
* and communication between the frontend, LLM, and Canvas APIs.

### Technologies

* FastAPI
* Python 3.12
* Pydantic
* SQLAlchemy


## 3. Local LLM Orchestration Layer

Responsible for:

* natural-language processing,
* workflow intent extraction,
* query generation,
* structured JSON outputs,
* and AI-assisted summaries.

### Planned LLM Options

* Ollama
* Mistral 7B
* Llama 3.1
* Phi-3 Mini
* Gemma

## 4. Canvas Integration Layer

Responsible for:

* communicating with Canvas LMS APIs,
* retrieving assignments,
* retrieving submissions,
* retrieving course data,
* and generating structured workflow previews.

The MVP focuses primarily on:

* retrieval,
* analysis,
* workflow planning,
* and preview generation

rather than autonomous execution.

# 5. PROJECT BOUNDARIES

## In Scope

The MVP WILL include:

* web-based dashboard,
* conversational AI interface,
* Canvas LMS integration,
* local/downloaded LLM support,
* workflow query generation,
* preview generation,
* audit logging,
* selected instructor workflows,
* Dockerized deployment,
* secure authentication,
* missing/late submission analysis,
* referencing user-provided templates,
* and AI-generated message drafts.

## Out of Scope

The MVP will NOT include:

* autonomous Canvas modifications,
* automatic assignment publishing,
* automatic grade changes,
* AI grading systems,
* student-facing AI assistants,
* native mobile applications,
* voice assistants,
* rollback systems,
* multi-LMS support,
* or full Canvas replacement.

# 6. USER GROUPS & PROTO-PERSONAS

## 1. Instructors (Primary Users)

### Proto-Persona: Dr. Sarah Chen

A university instructor managing multiple large courses and hundreds of students.

### Goals

* Reduce repetitive administrative work
* Quickly identify struggling students
* Simplify communication workflows
* Save time navigating Canvas

### Needs

* Fast analytics access
* Safe AI assistance
* Transparent previews
* Human oversight

## 2. System Administrators

### Proto-Persona: Marcus

Responsible for deployment, Docker infrastructure, and security.

### Goals

* Secure deployment
* Stable infrastructure
* Reliable CI/CD
* Clear logging and auditing


# 7. ENVISIONED USAGE SCENARIOS

## Scenario 1 — Missing Submission Analysis

### Instructor Request

> “Show students missing Assignment 3”

### System Response

The system:

* retrieves submission data,
* identifies missing students,
* generates summaries,
* shows the query generation timestamp,
* and displays affected users.

### Optional Workflow

Instructor requests:

> “Generate reminder message based on the template”

The system creates a reviewable draft preview similar to the user-provided template from the previous semester.


## Scenario 2 — Assignment Workflow Planning

### Instructor Request

> “Create a quiz called Week 6 Check-In due Friday at 11:59 PM”

### System Response

The system generates:

* assignment title,
* due date,
* points,
* instructions preview,
* and Canvas query preview.

The instructor reviews before approval.

## Scenario 3 — Course Analytics

### Instructor Request

> “Summarize Quiz 2 performance”

### System Response

The system retrieves:

* averages,
* participation trends,
* missing submissions,
* and grade distributions.

The AI generates a concise analytics report.


# 8. FUNCTIONAL REQUIREMENTS

## FR1 — Authentication & Authorization

The system must:

* support secure login,
* manage encrypted tokens,
* support logout/session expiration,
* and enforce role-based access.

## FR2 — Canvas API Integration

The system must:

* retrieve courses,
* retrieve assignments,
* retrieve submissions,
* retrieve student information,
* and generate structured Canvas queries.


## FR3 — Conversational AI Interface

The system must:

* accept natural-language requests,
* interpret instructor intent,
* generate structured outputs,
* and support conversational context.

## FR4 — Preview & Dry-Run System

The system must:

* generate workflow previews,
* display generated API queries,
* preview affected entities,
* and block unsafe operations.


## FR5 — Messaging Assistance

The system must:

* generate message drafts,
* generate reminder templates,
* and preview communication workflows.


## FR6 — Audit Logging

The system must:

* log workflows,
* log generated queries,
* track timestamps,
* and record approvals/actions.


## FR7 — Dashboard & Analytics

The system must:

* display course summaries,
* display assignment analytics,
* display recent workflows,
* and provide conversational dashboard interaction.


# 9. NON-FUNCTIONAL REQUIREMENTS

## Performance

* Dashboard pages must load within 2 seconds
* Query previews generated within 5 seconds
* API requests respond within 3 seconds


## Security & Privacy

* HTTPS/TLS encryption
* Secure token handling
* Local LLM support for privacy
* Audit logging
* Role-based permissions

## Reliability

* Graceful API failure handling
* Stable demo/testing operation
* No crashes during invalid requests incorporated with feedback


## Accessibility

* WCAG 2.1 AA compliance
* Keyboard navigation support
* Responsive layouts
* Accessible contrast standards


## Maintainability

* Modular architecture
* Dockerized deployment
* Reusable frontend components
* Documented APIs


# 10. MEASURABLE OBJECTIVES & SUCCESS CRITERIA

| Objective                                         | Success Criteria                                        |
| ------------------------------------------------- | ------------------------------------------------------- |
| Develop a functional AI-assisted Canvas dashboard | Core instructor workflows operational                   |
| Implement conversational workflow generation      | ≥90% successful intent interpretation                   |
| Ensure safe workflow previews                     | 100% reviewable actions before use                      |
| Maintain secure architecture                      | No unauthorized access during testing                   |
| Improve workflow efficiency                       | Common tasks completed ≥40% faster                      |
| Integrate local LLMs successfully                 | Local inference operational on all development machines |
| Deliver stable deployment                         | Docker deployment functional across all team systems    |
| Maintain usability                                | ≥85% positive peer usability feedback                   |


# 11. EDGE CASE HANDLING

| Scenario                       | System Response                       |
| ------------------------------ | ------------------------------------- |
| Invalid AI prompt              | Ask clarifying follow-up              |
| Canvas API unavailable         | Display retry/error message           |
| Expired authentication         | Require secure re-authentication      |
| LLM hallucinated query         | Validation layer blocks unsafe output |
| Ambiguous assignment reference | Ask instructor to choose target       |
| Unsupported workflow           | Explain MVP limitations               |



# 12. TECHNOLOGY STACK

| Category       | Technologies                    |
| -------------- | ------------------------------- |
| Frontend       | React, TypeScript, Tailwind CSS |
| Backend        | Python, FastAPI                 |
| AI/LLM         | Ollama, Mistral, Llama          |
| Validation     | Pydantic                        |
| Database       | SQLite / PostgreSQL             |
| Authentication | JWT, bcrypt                     |
| APIs           | Canvas REST APIs                |
| DevOps         | Docker, Docker Compose          |
| CI/CD          | GitHub Actions                  |
| Testing        | Pytest, Vitest, Postman         |



# 13. HIGH-LEVEL RISKS

| Risk                                        | Impact | Mitigation                               |
| ------------------------------------------- | ------ | ---------------------------------------- |
| LLM hallucinations                          | High   | Validation layers + dry-run previews     |
| Poor integration with external Canvas tools | High   | Edge-case testing and wrapper validation |
| Canvas API limitations                      | High   | Early API testing + pagination           |
| Scope creep                                 | High   | Strict MVP boundaries                    |
| Local model performance issues              | Medium | Lightweight quantized models             |
| Authentication complexity                   | Medium | Secure token workflows                   |
| Docker deployment issues                    | Medium | Standardized setup                       |



# 14. ASSUMPTIONS & CONSTRAINTS

## Assumptions

* Instructors already use Canvas LMS
* Canvas APIs remain available
* Users have modern browsers
* Team devices can run local LLMs



## Constraints

* Web application only
* No autonomous execution in MVP
* Limited capstone timeline
* Selected workflows only
* Local hardware limitations



# 15. TESTING & CI/CD

## Testing

The project will include:

* unit testing,
* API testing,
* integration testing,
* accessibility testing,
* and manual workflow testing.



## Continuous Integration

GitHub Actions will:

* run linting,
* validate builds,
* run automated tests,
* and enforce PR checks.



# 16. MILESTONE SCHEDULE

| Milestone | Deliverable                          |
| --------- | ------------------------------------ |
| May 27    | Project Plan Submission              |
| June 3    | Architecture & System Design         |
| June 6    | Design Video Presentation            |
| June 13   | Authentication + Dashboard Prototype |
| July 4    | MVP Feature Set #1                   |
| July 11   | Peer Testing & Integration           |
| July 25   | Full System Testing                  |
| August 8  | Final Presentation & Submission      |



# 17. TEAMWORK DISTRIBUTION

| Category             | Mridul | Bao | Jessica | Yerdana | Rhythm |
| -------------------- | ------ | --- | ------- | ------- | ------ |
| Backend Development  | ✔️     | ✔️  | ✔️      | ✔️      |        |
| Frontend Development |        | ✔️  | ✔️      |         | ✔️     |
| AI/LLM Integration   | ✔️     |     | ✔️      | ✔️      |        |
| DevOps & Docker      | ✔️     |     |         | ✔️      | ✔️     |
| Documentation        |        | ✔️  | ✔️      | ✔️      | ✔️     |
| Testing & QA         | ✔️     |     |         | ✔️      | ✔️     |
| Presentations        | ✔️     | ✔️  | ✔️      | ✔️      | ✔️     |



# 18. ANTICIPATED HURDLES

## 1. LLM Output Reliability

Ensuring local LLMs consistently generate valid structured outputs without hallucinating Canvas entities.

### Mitigation

* Pydantic validation
* strict schemas,
* preview enforcement,
* and safe fallback handling.



## 2. Frontend–Backend Integration

Parallel development may create API contract mismatches.

### Mitigation

* early API specification,
* mock responses,
* and milestone-based integration testing.



## 3. Team Coordination

Managing a large multi-component capstone project across five members.

### Mitigation

* GitHub Projects Kanban board,
* weekly sync meetings,
* pull-request reviews,
* and milestone tracking.



## 4. Context Window Limitations

LLMs have varying context sizes, and depending on usage, performance may degrade as the context window shrinks.

### Mitigation

Using a lightweight hybrid database incorporating graph structures and relational tables to help reconstruct workflows when context windows become full.


# 19. CONCLUSION

The Safe AI-Powered Canvas Workflow Assistant demonstrates a practical and responsible approach to AI integration in educational technology.

By combining:

* conversational AI,
* local LLM inference,
* Canvas LMS integration,
* workflow preview systems,
* secure dashboard architecture,
* and human-in-the-loop interaction,

the project modernizes instructor workflows while prioritizing:

* safety,
* transparency,
* explainability,
* privacy,
* accessibility,
* and instructor oversight.

The project also provides valuable experience in:

* full-stack software engineering,
* AI orchestration,
* secure system architecture,
* DevOps,
* API integration,
* collaborative development,
* and human-centered AI design.


