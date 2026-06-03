# System Design

## Introduction

## System Architecture Design

## Use Case Models
### Use Case Diagram
<img width="935" height="723" alt="use-case-diagram" src="https://github.com/user-attachments/assets/5905cfa6-e1e2-4bcb-8207-1690b33f53ad" />

---

### Use Case 1: Authenticate User (Login)
* **Primary actor:** Instructor, Teaching Assistant, System Administrator 
* **Description:** User logs into the application securely to receive an active session token. 
* **Precondition:** User account exists in the PostgreSQL database. 
* **Postcondition:** User is granted an active JWT and redirected to their respective dashboard. 

**Main scenario:**
1. User navigates to the login screen at `localhost:3000`.
2. User inputs their email and password and clicks "Login."
3. System verifies the password hash against the database.
4. System generates a JSON Web Token (JWT) for the session.
5. System redirects the user to the Course Dashboard (or System Dashboard for Admins).

**Extensions:**
* **3a. Invalid credentials.**
  * 3a1. System detects a mismatch in the email or password hash.
  * 3a2. System denies entry and displays an error banner: "Invalid email or password."

---

### Use Case 2: Terminate Session (Logout)
* **Primary actor:** Instructor, Teaching Assistant, System Administrator 
* **Description:** User securely exits the application, invalidating their active session. 
* **Precondition:** User is currently authenticated. 
* **Postcondition:** Session is terminated and user is returned to the login screen. 

**Main scenario:**
1. User clicks the "Logout" button in the navigation bar.
2. System immediately invalidates the active JWT.
3. System clears cached user data from the local browser storage.
4. System redirects the user to the Login screen.

---

### Use Case 3: Create User Account
* **Primary actor:** System Administrator 
* **Description:** Admin provisions a new user profile and assigns a role. 
* **Precondition:** Admin is authenticated and viewing the User Management portal. 
* **Postcondition:** A new user record is created in the PostgreSQL database. 

**Main scenario:**
1. Admin clicks "Add New User."
2. Admin enters the new user's email, assigns a temporary password, and selects a role (Instructor or TA).
3. Admin clicks "Save."
4. System hashes the temporary password and creates the user record in the database.

**Extensions:**
* **4a. Email already exists.**
  * 4a1. System database detects a duplicate email address.
  * 4a2. System prevents creation and alerts the Admin: "User with this email already exists."

---

### Use Case 4: Connect Canvas Account
* **Primary actor:** Instructor, Teaching Assistant 
* **Description:** User inputs their Canvas API token so the application can communicate with the Canvas LMS. 
* **Precondition:** User is authenticated. 
* **Postcondition:** The API token is securely encrypted and stored in the database. 

**Main scenario:**
1. User navigates to the Settings dashboard.
2. User pastes their Canvas API token into the input field and clicks "Save."
3. System encrypts the token via AES-256.
4. System saves the encrypted token to the user's database row.
5. System makes a test call to the Canvas API to verify access scopes.
6. System confirms success with a green toast notification.

**Extensions:**
* **5a. Token is invalid or lacks scopes.**
  * 5a1. The Canvas API returns an HTTP 401 (Unauthorized) or 403 (Forbidden) error.
  * 5a2. System deletes the invalid token from the database.
  * 5a3. System displays an error banner: "Authentication Failed: Ensure token is valid."

---

### Use Case 5: View Course & Submission Dashboard
* **Primary actor:** Instructor, Teaching Assistant 
* **Description:** User views a color-coded grid of student submission statuses. 
* **Precondition:** User has a valid API token stored. 
* **Postcondition:** The dashboard renders the current submission data. 

**Main scenario:**
1. User selects a specific course from the sidebar.
2. System queries the PostgreSQL cache for recent course assignments and submissions.
3. System renders the submission status grid (submitted, late, missing, excused).

**Extensions:**
* **2a. Cache is expired (TTL exceeded).**
  * 2a1. System automatically queries the Canvas API for fresh data.
  * 2a2. System updates the PostgreSQL cache before rendering the grid.
* **2b. Canvas API rate limit or timeout.**
  * 2b1. The Canvas API returns an HTTP 429 error or times out during the fetch.
  * 2b2. System initiates an exponential backoff retry.
  * 2b3. If retries fail, system displays a warning and shows the last known cached data.

---

### Use Case 6: Filter & Search Dashboard Data
* **Primary actor:** Instructor, Teaching Assistant 
* **Description:** User dynamically filters the dashboard to locate specific students or assignment statuses. 
* **Precondition:** The Course Dashboard is populated with data. 
* **Postcondition:** The UI updates to show only requested data without querying the backend. 

**Main scenario:**
1. User clicks the "Status" filter toggle and selects "Missing."
2. The frontend system isolates records matching the criteria.
3. System dynamically updates the grid to display only students with missing assignments.

---

### Use Case 7: Draft & Send AI Reminder Messages
* **Primary actor:** Instructor, Teaching Assistant 
* **Description:** User prompts the AI to draft messages, reviews them, and executes the send action. 
* **Precondition:** User is viewing a specific Course Dashboard. 
* **Postcondition:** Messages are dispatched via Canvas API and logged in the database. 

**Main scenario:**
1. User enters a command (e.g., "Draft a reminder to everyone missing Assignment 3").
2. System parses the command via the local LLM.
3. System identifies targeted students and generates a visual Dry-Run Preview of the drafted text.
4. User reviews the draft and clicks "Approve & Execute."
5. System decrypts the user's Canvas token and dispatches the messages via the Canvas API.
6. System logs the executed action in the database.

**Extensions:**
* **2a. LLM fails to parse prompt.**
  * 2a1. Pydantic validation rejects the LLM output. System prompts user to rephrase.
* **4a. User alters the draft.**
  * 4a1. User types in the preview text box to change the message tone before confirming.
* **4b. User aborts the action.**
  * 4b1. User clicks "Cancel"; draft is discarded, no API call is made.

---

### Use Case 8: Create Canvas Assignment via AI
* **Primary actor:** Instructor 
* **Description:** Instructor prompts the AI to create a new assignment in Canvas. 
* **Precondition:** Instructor has "Write" permissions on their Canvas token. 
* **Postcondition:** A new assignment is instantiated in Canvas and logged. 

**Main scenario:**
1. Instructor types a creation command (e.g., "Create a Week 6 Check-in quiz").
2. System parses the command and resolves dates via the LLM.
3. System checks Canvas for duplicate assignment names.
4. System generates a staging card showing proposed assignment fields.
5. Instructor reviews and clicks "Approve & Execute."
6. System creates the assignment via the Canvas API.
7. System logs the creation event in the database.

**Extensions:**
* **3a. Duplicate assignment name detected.**
  * 3a1. System flags the duplicate in the Dry-Run Preview, requiring the instructor to rename it.
* **5a. Instructor tweaks assignment parameters.**
  * 5a1. Instructor modifies fields (e.g., Points Possible) before executing.

---

### Use Case 9: View Personal Action History Log
* **Primary actor:** Instructor, Teaching Assistant 
* **Description:** User reviews their own past automated actions to ensure accountability. 
* **Precondition:** User has previously executed an AI action. 
* **Postcondition:** User successfully views their localized history. 

**Main scenario:**
1. User clicks on the "History" tab in the dashboard.
2. System queries the PostgreSQL database for audit logs strictly matching the current user's ID.
3. System displays a table with timestamps, action types, and affected entities.

---

### Use Case 10: View System Health Dashboard
* **Primary actor:** System Administrator 
* **Description:** Admin views high-level application metrics. 
* **Precondition:** Admin is authenticated. 
* **Postcondition:** Admin views real-time status of the local deployment. 

**Main scenario:**
1. Admin navigates to the System Dashboard.
2. System aggregates data from the database and Docker environment.
3. System displays active sessions, API error rates, and container health.

**Extensions:**
* **2a. Container health metrics unreachable.**
  * 2a1. System fails to read Docker stats.
  * 2a2. System displays standard database metrics but grays out container statistics with a "Data Unavailable" badge.

---

### Use Case 11: Modify User Roles & Permissions
* **Primary actor:** System Administrator 
* **Description:** Admin changes the access level of an existing user. 
* **Precondition:** Admin is viewing the User Management portal. 
* **Postcondition:** The target user's role is permanently updated. 

**Main scenario:**
1. Admin selects a user from the account list.
2. Admin changes the role drop-down from "TA" to "Instructor" and clicks Save.
3. System updates the role column in the PostgreSQL database.

**Extensions:**
* **3a. Admin attempts to demote the final Admin account.**
  * 3a1. System detects the action would leave the system without an administrator.
  * 3a2. System blocks the action and displays an error warning.

---

### Use Case 12: Deactivate User Account
* **Primary actor:** System Administrator 
* **Description:** Admin revokes application access for a user. 
* **Precondition:** Target user exists in the database. 
* **Postcondition:** User can no longer log in or execute actions. 

**Main scenario:**
1. Admin clicks "Deactivate" next to a user's profile.
2. System flags the account as `is_active: false` in the database.
3. System immediately invalidates any active JWTs for that user.

---

### Use Case 13: View System-Wide Master Audit Log
* **Primary actor:** System Administrator 
* **Description:** Admin reviews the master ledger of all user actions for compliance. 
* **Precondition:** Admin is authenticated. 
* **Postcondition:** Admin views actions taken across all accounts. 

**Main scenario:**
1. Admin navigates to the Master Audit tab.
2. System queries PostgreSQL for all logged AI events across all users.
3. System displays the ledger sequentially.

**Extensions:**
* **2a. Large dataset retrieval.**
  * 2a1. System detects more than 100 rows of audit logs.
  * 2a2. System implements pagination, loading the first 50 results to maintain UI performance.

---

### Use Case 14: Reset User Password
* **Primary actor:** Instructor, Teaching Assistant, System Administrator 
* **Description:** User recovers access to their account. 
* **Precondition:** User is on the login screen. 
* **Postcondition:** User sets a new password and gains entry. 

**Main scenario:**
1. User clicks "Forgot Password" and enters their email.
2. System validates the email against the database.
3. System prompts the user to enter and confirm a new password.
4. System generates a new password hash and overwrites the old hash in the database.

**Extensions:**
* **2a. Email not found.**
  * 2a1. System does not find the email in the database.
  * 2a2. To prevent account enumeration attacks, system displays a generic "If this email exists, a reset process has started" message, taking no database action.
## Database Design 

<img width="2048" height="860" alt="image" src="https://github.com/user-attachments/assets/b768a866-8bef-45b9-958d-a23f559a870c" />


# Entity Descriptions and Relationships

---

# **users**
- `id`: Primary Key
- `canvas_user_id`: Unique identifier linked to Canvas LMS
- `name`, `email`, `role`, `created_at`

Represents all system users (instructors, TAs, and admins). Each user is assigned a single role that determines their access level and permissions within the system.

---

# **sessions**
- `id`: Primary Key
- `user_id`: Foreign Key → `users`
- `token_hash`, `expires_at`, `created_at`

Tracks active login sessions for authenticated users. When a user logs in, a session record is created with a hashed token and an expiry timestamp. This is how the system validates whether a user is currently authenticated.

---

# **courses**
- `id`: Primary Key
- `canvas_course_id`: Unique identifier linked to Canvas LMS
- `name`, `term`, `instructor_id`, `created_at`

Stores courses imported from Canvas. Each course is owned by an instructor (via `instructor_id`) and carries a term to support multi-semester use.

---

# **assignments**
- `id`: Primary Key
- `canvas_assignment_id`: Unique identifier linked to Canvas LMS
- `course_id`: Foreign Key → `courses`
- `title`, `due_date`, `points_possible`, `created_at`

Stores assignments within a course, synced from Canvas. Each assignment belongs to exactly one course and carries metadata such as due date and point value.

---

# **submissions**
- `id`: Primary Key
- `canvas_submission_id`: Unique identifier linked to Canvas LMS
- `assignment_id`: Foreign Key → `assignments`
- `student_canvas_id`, `student_name`, `status`, `score`, `submitted_at`

Tracks individual student submissions per assignment. Students are not stored in the `users` table since the system is built for instructors, not students — they are referenced here only by their Canvas ID. Status can be `missing`, `late`, or `submitted`.

---
# **conversations**
- `id`: Primary Key
- `user_id`: Foreign Key → `users`
- `course_id`: Foreign Key → `courses` (optional)
- `created_at`

Represents a chat session between a user and the AI assistant. A conversation can optionally be scoped to a specific course, providing the assistant with relevant context for its responses.

---
# **messages**
- `id`: Primary Key
- `conversation_id`: Foreign Key → `conversations`
- `role`, `content`, `created_at`

Stores the individual messages within a conversation. Each message is attributed to either the `user` or the `assistant` via the `role` field, forming the full back-and-forth chat history.

---

# **workflows**
- `id`: Primary Key
- `conversation_id`: Foreign Key → `conversations`
- `user_id`: Foreign Key → `users`
- `intent`, `generated_query`, `preview_data`, `status`, `created_at`

The core of the system's "human-in-the-loop" safety model. When the AI generates an actionable operation (such as a bulk grade update or a student message), it is stored here as a workflow with a `pending` status. The instructor must explicitly approve or reject it before anything is executed. Status can be `pending`, `approved`, or `rejected`.

---

# **audit_logs**
- `id`: Primary Key
- `user_id`: Foreign Key → `users`
- `workflow_id`: Foreign Key → `workflows` (optional)
- `action`, `details`, `timestamp`

A complete record of all actions taken in the system, particularly approved workflows. This is the accountability layer — every operation can be traced back to a specific user and timestamp.

---

# **message_templates**
- `id`: Primary Key
- `user_id`: Foreign Key → `users`
- `course_id`: Foreign Key → `courses` (optional)
- `title`, `content`, `created_at`

Stores reusable message templates that instructors can create for common student communications. Templates can be scoped to a specific course or kept general for use across multiple courses.

---

# Cardinality Summary

| Relationship                            | Type     |
|-----------------------------------------|----------|
| User → Sessions                         | 1 : 0..* |
| User → Courses (as instructor)          | 1 : 0..* |
| Course → Assignments                    | 1 : 0..* |
| Assignment → Submissions                | 1 : 0..* |
| User → Conversations                    | 1 : 0..* |
| Course → Conversations                  | 1 : 0..* |
| Conversation → Messages                 | 1 : 0..* |
| Conversation → Workflows                | 1 : 0..* |
| User → Workflows                        | 1 : 0..* |
| User → Audit Logs                       | 1 : 0..* |
| Workflow → Audit Logs                   | 1 : 0..* |
| User → Message Templates               | 1 : 0..* |
| Course → Message Templates             | 1 : 0..* |

---

# Why This Model?

This model reflects the core design goal of a safe, auditable AI assistant for Canvas instructors:

- A unified `users` table simplifies account management across all roles
- Separating `conversations` from `messages` allows sessions to be tracked, resumed, and scoped to a course without duplicating data
- The `workflows` table enforces the human-in-the-loop requirement — no AI-generated action can execute without explicit instructor approval
- The `audit_logs` table ensures full traceability of every approved or rejected action, supporting compliance and accountability
- Students are deliberately excluded from the `users` table and referenced only by Canvas ID in `submissions`, keeping the system focused on instructor-facing workflows
- Canvas IDs are stored on all synced entities (`users`, `courses`, `assignments`, `submissions`) to support reliable integration with the Canvas LMS API
- `message_templates` are decoupled from conversations, allowing instructors to build a reusable library of communications independent of any specific AI session

## Data Flow Diagrams

### DFD Level 0 - Context Diagram
on n
The Level 0 DFD provides a high-level overview of the Agentic AI 
Canvas Course Management System. It illustrates the primary actors 
interacting with the system, including Instructors, Teaching 
Assistants, and the Administrator, as well as external systems 
such as the Canvas LMS and the local Ollama LLM service.

The diagram shows the major data flows entering and leaving the 
system, including user requests, generated responses, Canvas API 
interactions, and audit reports.

<img width="1170" height="776" alt="Screenshot 2026-06-02 210608" src="https://github.com/user-attachments/assets/d598a15b-ab38-4cbb-8c16-31b2d11c6e80" />


---

### DFD Level 1 - Process Decomposition

The Level 1 DFD expands the system into six core processes:

- **1.1 User Access** — Handles authentication and session management
- **1.2 Course Data Retrieval** — Fetches and caches course data 
  from Canvas LMS using the instructor's stored API token
- **1.3 Request Interpretation** — Parses natural language input 
  and consults the Ollama LLM to generate a structured action plan
- **1.4 Validation & Dry-Run Preview** — Validates the proposed 
  action and presents a preview to the instructor for approval
- **1.5 Execute Canvas Actions** — Executes approved actions 
  against the Canvas LMS REST API
- **1.6 Audit Logging & History** — Records all actions to the 
  audit log and surfaces failure notices to instructors and 
  query results to administrators

The diagram also shows six data stores: D1 User Sessions, 
D2 Canvas Tokens, D3 Course Cache, D4 Audit Logs, 
D5 Conversations, and D6 Workflows.

<img width="1752" height="1168" alt="Screenshot 2026-06-02 210907" src="https://github.com/user-attachments/assets/2d01fa06-3774-45b1-a74e-736262b4b58a" />



## User Interface (UI) Design

### Account Setup and Authentication

Upon opening the Canvas Workflow Assistant, users are first presented with the landing page. This page introduces the platform and explains how AI can be used to simplify Canvas course management through natural language workflows. The landing page highlights key features including Conversational AI, Workflow Previews, Local AI Privacy, and Audit Logging.

Users may select **Get Started** to begin the onboarding process or **Sign In** if they already have an account.
<img width="845" height="745" alt="Screenshot 2026-06-02 at 4 18 08 PM" src="https://github.com/user-attachments/assets/9d092ea7-6cc5-4f8b-b816-ffca6aae8472" />

Selecting **Sign In** will take users to the login page where they can enter their email address and password to access the system.

The page also includes a **Remember Me** option, a **Forgot Password** link for account recovery, and a **Sign Up** option for new users.

If the provided credentials are valid, users will be redirected to the dashboard associated with their assigned role.

<img width="901" height="714" alt="Screenshot 2026-06-02 at 4 18 29 PM" src="https://github.com/user-attachments/assets/65e8af9c-a5d0-4c53-ad74-b2deeb6707a0" />

Users who do not already have an account can select **Sign Up** from the login page. This will take them to the account registration page.

To create an account, users must:

* Enter their full name
* Enter an email address
* Create a password
* Confirm their password
* Agree to the Terms of Service
* Agree to the Privacy Policy

If all required information is provided successfully, the account will be created and the user will proceed to the permissions setup process.
<img width="959" height="756" alt="Screenshot 2026-06-02 at 4 18 23 PM" src="https://github.com/user-attachments/assets/bcf8edeb-1583-43e6-9519-875c8febeb74" />

After successfully creating an account, users will be shown a permissions review page. This page explains which actions the Canvas Workflow Assistant can perform and which actions require explicit approval before execution.

Allowed actions such as viewing courses, assignments, and submissions are clearly identified, while higher-impact actions such as grade modifications and assignment publishing require manual confirmation.

Users may review the permissions and select **Approve & Continue** to proceed.
<img width="769" height="794" alt="Screenshot 2026-06-02 at 4 39 33 PM" src="https://github.com/user-attachments/assets/5e465428-5b3b-46d3-afef-7274d64c2f29" />

After reviewing permissions, users are taken to the Canvas account connection page.

This page explains why Canvas access is required and what information the system will use. Users can securely connect their Canvas account to enable AI-assisted workflow management.

Once the Canvas connection is successfully established, users are redirected to the dashboard associated with their role.
<img width="541" height="816" alt="Screenshot 2026-06-02 at 4 40 05 PM" src="https://github.com/user-attachments/assets/4037c840-432d-45a1-a357-e1d82030f5c8" />

If Canvas authentication fails during setup, users will be presented with an authentication failure page.

The page explains common causes of connection failures, including invalid credentials, insufficient permissions, expired access tokens, or network issues. Users may retry the connection process, contact an administrator, or return to the login page.
<img width="839" height="713" alt="Screenshot 2026-06-02 at 4 40 38 PM" src="https://github.com/user-attachments/assets/3db8e688-1ddc-4d66-b958-8a5210635f17" />
# Instructor Portal

After successfully connecting their Canvas account, instructors are redirected to the Instructor Dashboard. This page provides a high-level overview of active courses, student activity, pending approvals, notifications, and recent AI workflow activity.

The dashboard also provides quick access to commonly used AI actions such as creating assignments, generating announcements, and analyzing student performance.

<img width="618" height="814" alt="Screenshot 2026-06-02 at 4 41 27 PM" src="https://github.com/user-attachments/assets/ff5da174-7513-4068-8ca1-70fa96929d62" />

Selecting **Courses** from the navigation menu will take instructors to the Course Management page.

This page displays all courses associated with the instructor along with key performance metrics including average performance, active students, assignment completion rates, and at-risk student counts.

Instructors can select a course to access detailed course information and analytics.

<img width="682" height="805" alt="Screenshot 2026-06-02 at 4 42 02 PM" src="https://github.com/user-attachments/assets/dcaa7a02-e368-491d-86f9-9305e91d7985" />

Selecting a course from the Course Management page opens the Course Details page.

This page provides detailed information regarding course activity, assignments, student engagement, submission progress, and recent events occurring within the course.

Instructors can quickly identify important updates and monitor course performance from a single location.

<img width="748" height="816" alt="Screenshot 2026-06-02 at 4 42 42 PM" src="https://github.com/user-attachments/assets/e5ae1fd6-6ceb-4c09-b820-ad0b3360d0ca" />

Selecting **AI Assistant** from the navigation menu opens the conversational interface used to interact with the system.

The AI Assistant allows instructors to perform Canvas-related tasks using natural language commands. Instructors can request actions such as creating assignments, generating reminders, summarizing performance data, or analyzing missing submissions.

Suggested actions are displayed to help users discover available functionality.

<img width="1042" height="748" alt="Screenshot 2026-06-02 at 4 43 18 PM" src="https://github.com/user-attachments/assets/719cc428-15a6-416e-9b53-880ccae37ba3" />

When instructors choose to create an assignment using AI, they are taken to the AI Assignment Creator page.

This page allows instructors to describe assignment requirements using natural language. The AI then generates assignment details based on the provided prompt before presenting them for review.

Suggested prompts are provided to assist instructors in creating effective assignments.

<img width="832" height="805" alt="Screenshot 2026-06-02 at 4 44 52 PM" src="https://github.com/user-attachments/assets/f6955521-a2ae-4213-9e07-c8d8eb7cd836" />

Before any AI-generated action is executed, instructors are presented with a Workflow Preview and approval page.

This page displays the original request, affected courses, assignments and students. Instructors may approve, modify, or reject the workflow before execution.
This review process ensures transparency and maintains human oversight over all AI-assisted actions.

<img width="399" height="334" alt="Screenshot 2026-06-02 at 4 46 20 PM" src="https://github.com/user-attachments/assets/07b7abe3-ac6f-43ac-89ea-e4c7935a4987" />
<br>
<img width="391" height="406" alt="Screenshot 2026-06-02 at 4 46 30 PM" src="https://github.com/user-attachments/assets/6b486997-858e-4a70-bee5-e7a8ccdc59c7" />

The Message Drafting page allows instructors to generate personalized messages for students.

Instructors can select one or more students, choose a message template, and generate AI-assisted drafts. Drafts can be reviewed and edited before being sent through Canvas.

<img width="652" height="809" alt="Screenshot 2026-06-02 at 4 51 54 PM" src="https://github.com/user-attachments/assets/caa8bdae-b20a-434b-90a2-bb29c0ebcf1d" />

The Missing Submission Analysis page provides instructors with a centralized view of students who have missing or late assignments.

The system highlights submission patterns, identifies students requiring attention, and generates recommendations for potential interventions.

Instructors may also generate reminder messages directly from this page.

<img width="783" height="816" alt="Screenshot 2026-06-02 at 4 52 52 PM" src="https://github.com/user-attachments/assets/75699fe4-79bd-4112-a1a5-ecba643dcc55" />

The Course Analytics page provides visualizations and AI-generated insights related to student performance and engagement.

Metrics such as grade distributions, participation trends, assignment completion rates, and at-risk student indicators help instructors better understand course performance.

<img width="494" height="816" alt="Screenshot 2026-06-02 at 4 53 24 PM" src="https://github.com/user-attachments/assets/0af56a08-0b38-438f-92aa-55543d1c7bc2" />

The Workflow History page provides a record of all AI-generated actions performed within the instructor's courses.

Each entry includes the action performed, approval status, timestamps, and affected resources, allowing instructors to track previous workflow activity.

<img width="1038" height="806" alt="Screenshot 2026-06-02 at 4 54 29 PM" src="https://github.com/user-attachments/assets/f0e79516-40cb-4111-b4bf-6613d8675d5c" />

The settings page allows instructors to manage profile information, notification preferences, security settings, and account access. Instructors can update personal information, configure workflow notifications, enable two-factor authentication, and review active sessions associated with their account.

<img width="312" height="665" alt="Screenshot 2026-06-02 at 4 55 51 PM" src="https://github.com/user-attachments/assets/edf3f2ba-a60e-4bec-b798-e38fe6bc5b6b" />

## Teaching Assistant Portal

Selecting **Dashboard** from the navigation menu will take Teaching Assistants to their main dashboard.

The dashboard provides a summary of assigned courses, missing and late submissions and pending message drafts. Quick action buttons allow TAs to efficiently monitor course progress and assist instructors with course management activities.

The dashboard also clearly displays which actions Teaching Assistants are permitted to perform and which actions require instructor approval.

<img width="470" height="815" alt="Screenshot 2026-06-02 at 5 16 52 PM" src="https://github.com/user-attachments/assets/8c9d3e5a-6d87-42f1-beb4-32c973d52f86" />

After logging into the system, Teaching Assistants can access the Assigned Courses page. This page displays all courses assigned to the TA along with information such as the course instructor, student count, assignment count, and the number of missing submissions.

Teaching Assistants can quickly navigate to student information, assignment details, and course analytics directly from this page.

<img width="547" height="812" alt="Screenshot 2026-06-02 at 5 18 07 PM" src="https://github.com/user-attachments/assets/2ea24401-bee3-470b-ba16-32ce224322d9" />

Selecting **Message Drafts** from the navigation menu will take Teaching Assistants to the message creation and management page.

This page allows TAs to draft communications related to missing assignments, late submissions, office hours, and other course-related topics. Teaching Assistants can manually create drafts or use AI assistance to generate message content.

Since TAs do not have permission to directly send messages, all drafts must be submitted to the instructor for review and approval before being distributed to students.

<img width="1045" height="736" alt="Screenshot 2026-06-02 at 5 14 25 PM" src="https://github.com/user-attachments/assets/eb3b057c-c8f3-456a-98cc-1c9c1873562f" />


Selecting **Missing & Late Work** from the navigation menu will take Teaching Assistants to a centralized view of overdue and incomplete assignments.

This page displays students who have outstanding work, assignment details, submission status, and the number of days overdue. Filters and search functionality allow TAs to quickly locate specific students or assignments.

The page helps Teaching Assistants identify students who may require reminders or additional academic support.

<img width="1037" height="732" alt="Screenshot 2026-06-02 at 5 13 28 PM" src="https://github.com/user-attachments/assets/6c7c16d6-79dc-4602-8b54-3c1c96189e8a" />

Selecting **Student Monitoring** from the navigation menu will take Teaching Assistants to the student performance monitoring page.

This page provides an overview of student progress including course completion rates, grades, missing assignments, and risk indicators. AI-generated summaries identify students who may be struggling academically and recommend potential interventions.

Teaching Assistants can use this information to monitor student engagement and provide assistance before performance issues become more significant.

<img width="1037" height="734" alt="Screenshot 2026-06-02 at 5 12 33 PM" src="https://github.com/user-attachments/assets/26899af7-850c-4b10-8022-f1f6a2e16ab8" />

The settings page allows Teaching Assistants to manage profile information, notification preferences, security settings, and active sessions. Users can update personal information, change passwords, configure notifications, and enable two-factor authentication to improve account security.

# Administrator Portal

After logging into the system, administrators are redirected to the System Dashboard. This page provides a high-level overview of platform activity, including active users, connected Canvas accounts, active courses, and overall system uptime.

The dashboard also displays the status of major services such as the frontend, backend, database, Canvas API, and AI services. Recent system events and resource usage metrics are presented to help administrators quickly assess the health of the platform.

<img width="818" height="574" alt="Screenshot 2026-06-02 at 5 21 51 PM" src="https://github.com/user-attachments/assets/b7e94a18-7a3f-47b2-add7-45a741a8e3c9" />

Selecting **User Management** from the navigation menu will take administrators to the user administration page.

This page displays all registered users within the platform, including instructors, teaching assistants, and administrators. Administrators can search for users, review account information, manage account status, and assign roles.

The page provides a centralized location for maintaining user accounts and ensuring appropriate access permissions throughout the system.

<img width="826" height="577" alt="Screenshot 2026-06-02 at 5 22 30 PM" src="https://github.com/user-attachments/assets/c57132f2-a14a-4a68-ac90-1fa18867e8e6" />

Selecting **Audit Logs** will take administrators to the system audit page.

This page records significant actions performed throughout the platform, including AI workflow executions, user management activities, data exports, and system configuration changes.

Administrators can search, filter, and export audit records to support accountability, security reviews, and compliance requirements.

<img width="822" height="574" alt="Screenshot 2026-06-02 at 5 22 55 PM" src="https://github.com/user-attachments/assets/4fc91f06-02d3-4038-b0fc-9a63c0ac2069" />

Selecting **System Health** from the navigation menu will display the operational status of all major platform services.

The page provides real-time information regarding service uptime, response times, request volumes, memory usage, error rates, and API performance. Services such as the frontend application, backend services, Canvas API integration, database, and local LLM infrastructure are monitored continuously.

This page allows administrators to quickly identify service degradation or outages that may impact platform functionality.

<img width="821" height="573" alt="Screenshot 2026-06-02 at 5 23 45 PM" src="https://github.com/user-attachments/assets/5d9f8eb5-e1db-4841-bdf3-471ea926d1d6" />

Selecting **Security Management** will take administrators to the platform's security monitoring interface.

This page displays login activity, failed authentication attempts, active sessions, suspicious activity alerts, expired authentication tokens, and API failures. Administrators can review recent security events and monitor access permissions across different user roles.

The page assists administrators in identifying potential security threats and maintaining the integrity of the platform.

<img width="822" height="589" alt="Screenshot 2026-06-02 at 5 24 15 PM" src="https://github.com/user-attachments/assets/b4e026d0-6703-4085-ac60-a3861738c3bc" />

Selecting **Roles & Permissions** will take administrators to the role management interface.

This page allows administrators to configure role-based access control throughout the platform. Administrators can review existing roles, create custom roles, and manage permissions assigned to instructors, teaching assistants, and administrators.

Permissions such as viewing courses, generating AI message drafts, managing users, approving workflows, and accessing audit logs can be assigned or revoked as needed.

Changes made on this page are applied across the system to ensure consistent access control and security policies.

<img width="821" height="569" alt="Screenshot 2026-06-02 at 5 24 53 PM" src="https://github.com/user-attachments/assets/6222cb6f-d1e6-427e-9a35-24fc374e7325" />

Selecting **Settings** will take administrators to the platform configuration page.

This page allows administrators to manage global system settings including Canvas integration settings, AI model configuration, notification preferences, security policies, backup schedules, and recovery options.

Administrators can configure API endpoints, monitor integration status, adjust AI model settings, define password requirements, enable multi-factor authentication, and manage system backups from a single interface.

The Settings page serves as the central location for maintaining and configuring the overall platform environment.

<img width="820" height="723" alt="Screenshot 2026-06-02 at 5 25 32 PM" src="https://github.com/user-attachments/assets/fd841aa1-256d-4317-9dfb-3e3e75401711" />

## UI Design Disclaimer
The wireframes presented in this section represent the current planned user interface for the Canvas Workflow Assistant and are intended to communicate the overall user experience, navigation structure, and core system functionality. As development progresses, certain interface components, layouts, workflows, and visual elements may be refined or modified based on implementation constraints, user feedback, usability testing, and evolving project requirements. Any changes made during development will maintain the core functionality and objectives described throughout this design document.
