# PRD — Briefline CRM

**Language:** English  
**Status:** Baseline v1  
**Owner:** Product & Architecture  
**Last updated:** 2026-08-11  
**Spanish counterpart:** `02-prd.es.md`

## 1. Purpose

Briefline CRM is an internal tool for small digital agencies. It connects clients, owners, and tasks so the team can understand what work exists, who owns it, what is blocked, what is due, and how each item has changed.

The product is a portfolio case study. It must feel like credible business software, be easy to evaluate through a public demo, and demonstrate professional frontend, backend, data, security, accessibility, and delivery decisions.

## 2. Problem

Small teams often track clients and work across spreadsheets, messages, and personal task managers. This causes unclear ownership, forgotten work, weak prioritization, no reliable history, dependence on informal knowledge, and poor management visibility.

## 3. Value proposition

Briefline CRM provides a shared and actionable view of client work through simple permissions, a visual board, useful filters, and automatic traceability, without the complexity of a full enterprise sales CRM.

## 4. Target users

### Agency administrator

An owner, project lead, or operations manager who needs global visibility, user management, and control over assignments and priorities.

### Agency member

A designer, developer, marketer, or account specialist who needs to find, understand, and update assigned client work quickly.

### Portfolio evaluator

A freelance client or technical recruiter who needs registration-free access, fast product comprehension, and visible evidence of real authorization and engineering quality.

## 5. Goals

| ID | Goal |
|---|---|
| OBJ-001 | Make all active work and ownership visible |
| OBJ-002 | Reduce the effort required to prioritize and update tasks |
| OBJ-003 | Keep a reliable audit trail of important changes |
| OBJ-004 | Enforce consistent permissions in the UI and server |
| OBJ-005 | Provide a safe, stable, and understandable public demo |
| OBJ-006 | Demonstrate full-stack competence with particular frontend strength |

## 6. Non-goals

- Replacing a sales CRM with leads, deals, forecasting, or marketing automation.
- Managing billing, payments, or contracts.
- Real-time collaboration.
- Multi-company or multi-tenant SaaS support.
- Configurable workflows.
- Native mobile applications.

## 7. Product principles

1. **Clarity before density:** screens prioritize decisions over raw information volume.
2. **Server-enforced trust:** permissions never depend only on the UI.
3. **Trace important change:** relevant business changes leave evidence.
4. **Fast demo comprehension:** an evaluator understands the product in under two minutes.
5. **Accessible alternatives:** no critical action depends solely on color, pointer input, or drag-and-drop.
6. **Deliberate scope:** every feature solves a central problem or demonstrates a relevant skill.

## 8. Portfolio MVP scope

### Included

- Login with demo accounts.
- Compact dashboard.
- Basic clients and client details.
- Task board.
- Mobile-adapted list.
- Task creation and editing.
- Single-member assignment.
- Separate backlog.
- Priorities, search, and filters.
- Drag-and-drop with an accessible alternative.
- Task archiving.
- Per-task change history.
- Administrator user management.
- Basic own profile.
- Versioned, documented REST API.
- Seed data and periodic demo reset.
- Critical tests and public deployment.

### Excluded

- Registration, email invitations, password recovery, and refresh tokens.
- Multiple contacts per client.
- Comments, labels, and checklists.
- Attachments, notifications, mentions, and real-time updates.
- Import/export.
- Custom statuses and priorities.
- Physical deletion through the application.

## 9. Portfolio Complete scope

- Contacts as an independent entity with multiple contacts per client.
- Desktop list view with complete sorting and pagination.
- Append-only task comments.
- Manageable labels.
- Simple task checklist.
- Client history.
- URL-persisted filters.
- Advanced keyboard navigation and accessibility refinements.
- Broader automated coverage and operational documentation.

## 10. Future Roadmap

- In-app and email notifications.
- Attachments and mentions.
- Real-time updates.
- Hierarchical subtasks.
- Password recovery and renewable sessions.
- Invitations and CSV export.
- Multiple workspaces.
- External integrations.
- Configurable states and fields.

## 11. Functional model

### User

- Full name.
- Case-insensitive unique email.
- Role: `ADMIN` or `MEMBER`.
- Status: `ACTIVE` or `INACTIVE`.
- Password hash.
- Last login at.
- Created at and updated at.

### Client

- Company name.
- Industry.
- Primary contact name and email.
- Optional phone.
- Status: `ACTIVE`, `INACTIVE`, or `ARCHIVED`.
- Optional notes.
- Created by.
- Created at and updated at.

### Task

- Title and description.
- Status: `BACKLOG`, `PENDING`, `IN_PROGRESS`, `BLOCKED`, or `COMPLETED`.
- Priority: `LOW`, `MEDIUM`, `HIGH`, or `URGENT`.
- Optional assignee in backlog; required outside backlog.
- Optional client.
- Optional due date.
- Blocked reason, required only while blocked.
- Creator.
- Optional archived at and archived by.
- Created at and updated at.

### Task change

- Task and actor.
- Event type.
- Optional field, old value, and new value.
- Created at.

## 12. Business rules

| ID | Rule |
|---|---|
| BR-001 | Only active users may authenticate |
| BR-002 | User email is case-insensitively unique |
| BR-003 | The last active administrator cannot be demoted or deactivated |
| BR-004 | Inactive users cannot receive new assignments |
| BR-005 | Authenticated users may view non-archived clients |
| BR-006 | Members may create clients; only administrators may edit, deactivate, or archive them |
| BR-007 | A task has at most one assignee |
| BR-008 | Backlog tasks may be unassigned |
| BR-009 | Tasks outside backlog require an active assignee |
| BR-010 | Blocked tasks require a non-empty blocked reason |
| BR-011 | Outside blocked status, the reason remains in history but not as an active value |
| BR-012 | Completed tasks may be reopened |
| BR-013 | Members may edit tasks they created or are assigned to |
| BR-014 | Administrators may edit any task |
| BR-015 | Only administrators may archive tasks |
| BR-016 | Archived tasks are read-only and excluded from active views by default |
| BR-017 | Creation and relevant changes produce append-only history |
| BR-018 | A task mutation and its history entry are atomic |
| BR-019 | Dates are persisted in UTC and displayed in the browser time zone |
| BR-020 | A date-only deadline expires at the end of that local day |

## 13. Functional requirements summary

### Authentication

| ID | Requirement |
|---|---|
| FR-AUTH-001 | Users can log in with email and password |
| FR-AUTH-002 | Invalid credentials are rejected without disclosing which value failed |
| FR-AUTH-003 | Inactive users are denied access |
| FR-AUTH-004 | Users can log out locally |
| FR-AUTH-005 | Protected routes require a valid access token |

### Dashboard

| ID | Requirement |
|---|---|
| FR-DASH-001 | Show open, overdue, blocked, and recently completed task counts |
| FR-DASH-002 | Show a prioritized `My tasks` list |
| FR-DASH-003 | Show recent activity visible to the user |
| FR-DASH-004 | Relevant indicators link to filtered views |

### Clients

| ID | Requirement |
|---|---|
| FR-CLI-001 | List clients with search and status filter |
| FR-CLI-002 | Provide empty, loading, and error states |
| FR-CLI-003 | Any active user may create a client |
| FR-CLI-004 | Only administrators may edit, deactivate, or archive a client |
| FR-CLI-005 | Show client details and related tasks |
| FR-CLI-006 | Archived clients cannot receive new task associations |

### Tasks

| ID | Requirement |
|---|---|
| FR-TASK-001 | Show a separate backlog and active-state columns |
| FR-TASK-002 | Create tasks while enforcing assignee and blocked-reason rules |
| FR-TASK-003 | Edit tasks according to role, authorship, or assignment |
| FR-TASK-004 | Change task status through drag-and-drop |
| FR-TASK-005 | Provide an accessible alternative to drag-and-drop |
| FR-TASK-006 | Filter by state, priority, assignee, client, and due condition |
| FR-TASK-007 | Search title and description |
| FR-TASK-008 | Show details, editing, and history in a side panel |
| FR-TASK-009 | Reopen completed tasks |
| FR-TASK-010 | Allow administrators to archive tasks |
| FR-TASK-011 | Provide administrators with a separate archived-task view |
| FR-TASK-012 | Keep a valid optimistic move or revert it with feedback on failure |

### Users

| ID | Requirement |
|---|---|
| FR-USR-001 | Administrators can list and search users |
| FR-USR-002 | Administrators can create users with an initial password |
| FR-USR-003 | Administrators can edit name, role, and status |
| FR-USR-004 | The system protects the last active administrator |
| FR-USR-005 | The system identifies work requiring reassignment when a user is deactivated |
| FR-USR-006 | Users can view and update their own name |

### History

| ID | Requirement |
|---|---|
| FR-HIST-001 | Record creation and changes to title, status, priority, assignee, due date, and archive state |
| FR-HIST-002 | Show actor and date for every event |
| FR-HIST-003 | Present previous and new values clearly |
| FR-HIST-004 | History cannot be edited or deleted through the application |

## 14. Non-functional requirements summary

| ID | Category | Requirement |
|---|---|---|
| NFR-SEC-001 | Security | Passwords are stored only as resistant hashes |
| NFR-SEC-002 | Security | Server authorization is enforced for every operation |
| NFR-SEC-003 | Security | Secrets and credentials remain outside the repository |
| NFR-SEC-004 | Security | Login is rate limited |
| NFR-SEC-005 | Security | DTOs reject unexpected properties |
| NFR-ACC-001 | Accessibility | Main flows target WCAG 2.2 AA |
| NFR-ACC-002 | Accessibility | Every action is keyboard operable |
| NFR-ACC-003 | Accessibility | Focus is visible and follows a logical order |
| NFR-ACC-004 | Accessibility | Color is not the only state indicator |
| NFR-PERF-001 | Performance | Local interactions provide perceptible feedback within 100 ms |
| NFR-PERF-002 | Performance | Common API responses target p95 below 500 ms under demo load |
| NFR-PERF-003 | Performance | Potentially growing lists use server-side pagination |
| NFR-REL-001 | Reliability | Task changes and history commit in one transaction |
| NFR-REL-002 | Reliability | Errors never leave the UI in a falsely optimistic state |
| NFR-OBS-001 | Observability | The API emits structured logs without secrets or passwords |
| NFR-COMP-001 | Compatibility | Support the latest two stable Chrome, Firefox, Safari, and Edge releases |
| NFR-RESP-001 | Responsive | Full desktop, functional tablet, and list-adapted mobile experience |
| NFR-MAIN-001 | Maintainability | Strict TypeScript and domain-separated modules |
| NFR-DOC-001 | Documentation | OpenAPI represents the public API routes |

## 15. Primary flows

### FLOW-001 — Evaluate as administrator

Log in with the administrator demo account, review the dashboard, create a client, create a related backlog task, assign and activate it, move it through active states, provide a blocked reason, inspect history, and review user-management capabilities.

### FLOW-002 — Work as member

Log in as member, review `My tasks`, filter work, update and complete an assigned task, inspect its history, and verify that user management and unrelated task editing are unavailable.

### FLOW-003 — Reject unauthorized mutation

A member attempts to modify an unrelated task through the API. The server returns forbidden and neither task nor history changes.

## 16. Success signals

- The primary flow works without external documentation.
- An evaluator identifies the product purpose and roles in under two minutes.
- No protected operation depends only on hidden React controls.
- No task mutation is committed without its history event.
- Every automatable critical criterion has a test.
- The demo recovers automatically from public changes.
- Main routes target a Lighthouse Accessibility score of at least 95, without treating automation as a substitute for manual testing.

## 17. Demo data

- Fictional company: `Northstar Digital Studio`.
- 8 users: 2 administrators and 6 members.
- 12 clients across industries and states.
- 36 tasks across states, priorities, assignees, and due conditions.
- Enough historical activity to make the timeline meaningful.
- Two highlighted demo accounts: administrator and member.
- Daily reset plus a protected manual recovery mechanism.

## 18. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Complete scope exceeds 20 hours | High | Separate MVP, Complete, and Roadmap; estimate per task |
| Drag-and-drop is inaccessible | High | Permanent move control and manual accessibility testing |
| Permissions become inconsistent | High | Central permission matrix, server policies, and negative tests |
| Public visitors degrade demo data | High | Fictional data, daily reset, and protected recovery |
| History becomes inconsistent | High | Transactional writes and rollback tests |
| Product name overlaps a brand | Medium | Treat it as a working case-study name and validate before commercial use |
| Free hosting sleeps or changes limits | Medium | Document limits and keep deployment reproducible |

## 19. MVP exit criteria

- All `Must` MVP requirements are accepted.
- FLOW-001 through FLOW-003 pass in the public environment.
- There are no known critical or high-severity defects.
- Permissions have been tested through UI and API.
- The board remains operable without drag-and-drop.
- API and data model documentation are complete.
- Demo reset and safe seed data are verified.
- README and case study explain scope, decisions, and trade-offs.

## 20. Documents derived from this PRD

- Full permission matrix.
- Data model and integrity rules.
- REST contract and error catalogue.
- Architecture and ADRs.
- UX and accessibility specification.
- Test strategy.
- Deployment and demo plan.
- Roadmap, epics, stories, tasks, acceptance criteria, and traceability.

