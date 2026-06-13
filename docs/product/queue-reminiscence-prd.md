# Queue Reminiscence — Product Requirements Document

Status: Draft v0.1  
Last updated: 2026-06-13  
Repository: https://github.com/Umi4Life/queue-reminiscence

---

## 1. Product Summary

**Queue Reminiscence** is an operator-managed digital queue board system for arcades and casual venues.

It replaces paper, marker, and whiteboard queue sheets with QR-accessible web boards while preserving the social behavior of physical arcade queue boards:

- semi-anonymous participant names
- public visibility
- anyone on-site can add themselves
- anyone on-site can remove ghost/no-show entries
- no participant account registration
- visible action history

The product is **not** a reservation system.  
The product is **not** a participant-account queue app.  
The product is **not** a public user-generated board creator.

The product is an **official venue/operator-managed public queue board**.

---

## 2. Problem Statement

Most arcade/general queue boards use paper, marker, or whiteboards. These are easy to understand but have recurring operational problems:

- paper sheets run out
- markers run out or become unreadable
- handwriting can be unclear
- staff may need to refill, erase, or rewrite boards
- queue history is not preserved
- public queue behavior is difficult to observe after the fact
- physical boards do not support dynamic display or integration

Arcades and community venues need a low-friction digital replacement that keeps the familiar behavior of physical boards while reducing maintenance and improving observability.

---

## 3. Product Thesis

Queue Reminiscence should preserve the culture and usability of paper arcade queue boards while making them digital, durable, observable, and display-friendly.

Core thesis:

> The board is permanent. The permission to write on it is fresh.

Participants should not need accounts. Instead, the system should use current on-site access, visible logs, rate limits, soft deletion, and staff controls to handle abuse.

---

## 4. Core Principles

1. **Physical-board behavior first**
   - The system should feel like scanning and writing on a public board, not booking a reservation.

2. **No participant accounts**
   - Participants do not register, log in, or claim durable identity.

3. **Operator-managed boards**
   - Boards are created and managed by arcade operators, venue staff, or system administrators.

4. **Semi-anonymous names**
   - Participants may write arbitrary display names that others can recognize.

5. **Public self-moderation**
   - Public users may remove entries to handle ghosting, duplicates, mistakes, or completed turns.

6. **Visible accountability**
   - Every action is logged. Public activity is available on the board, collapsed by default.

7. **Soft deletion**
   - Removed entries are hidden from the active queue but preserved in history.

8. **Fresh edit permission**
   - Public add/remove actions should require a current QR/access credential or session derived from one.

9. **Display-friendly architecture**
   - The system should support future e-ink and MQTT display integrations.

10. **Local demo first, SaaS-compatible later**
    - Initial deployment can serve a local community, but the domain model should not block future SaaS or multi-venue operation.

---

## 5. Target Users

### 5.1 Participant

A player/customer who wants to join or manage the queue.

Participants can:

- scan a QR code
- view a board
- view current queue entries
- add an arbitrary display name
- remove an active queue entry
- expand/collapse recent activity

Participants cannot:

- create boards
- create accounts
- log in
- claim ownership of entries
- receive guaranteed individual notifications
- access the admin UI

### 5.2 Venue Staff

A staff member operating boards at a physical venue.

Venue staff can:

- log into the admin UI
- view venue boards
- open/close boards
- reset queues
- remove entries from admin UI
- view detailed history
- rotate QR/access credentials, if permitted

### 5.3 Venue Manager

A manager responsible for a physical location.

Venue managers can:

- manage boards under their venue
- manage venue staff accounts
- generate QR codes
- configure board behavior
- view venue-level logs/history

### 5.4 Organization Owner

An organization-level operator for a company/group with multiple venues.

Organization owners can:

- manage organization settings
- create/edit venues
- manage organization-level users
- manage all boards across venues
- view organization-wide logs/history

---

## 6. Domain Model

Queue Reminiscence should support a hierarchy where one organization may operate multiple venues, and each venue may contain multiple boards.

```text
Organization
  -> Venue
    -> Board
      -> QueueEntry
      -> BoardEvent
```

Examples:

```text
Organization: Round1
  Venue: Round1 Ikebukuro
    Board: CHUNITHM Cabinet 1
    Board: maimai DX Left

  Venue: Round1 Dotonbori
    Board: SDVX Cabinet 2

Organization: Echo EX10
  Venue: Echo EX10 MBK
    Board: CHUNITHM Gold

  Venue: Echo EX10 Ladprao
    Board: maimai DX
```

### 6.1 Organization

Represents an operating company, arcade group, community, or tenant.

Suggested fields:

```ts
Organization {
  id: string
  slug: string
  name: string
  createdAt: Date
  updatedAt: Date
}
```

### 6.2 Venue

Represents a physical location under an organization.

Suggested fields:

```ts
Venue {
  id: string
  organizationId: string
  slug: string
  name: string
  timezone: string
  address?: string
  createdAt: Date
  updatedAt: Date
}
```

### 6.3 Board

Represents one queue surface at a venue.

Suggested fields:

```ts
Board {
  id: string
  venueId: string

  slug: string
  publicSlug: string
  name: string
  description?: string

  status: "open" | "closed"

  publicViewPolicy: "open" | "access_code_required"
  publicAddPolicy: "access_code_required" | "staff_only" | "disabled"
  publicRemovePolicy: "access_code_required" | "staff_only" | "disabled"

  qrRotationPolicy: "manual" | "scheduled"
  qrRotationIntervalMinutes?: number

  createdAt: Date
  updatedAt: Date
}
```

### 6.4 QueueEntry

Represents an active or removed queue entry.

Suggested fields:

```ts
QueueEntry {
  id: string
  boardId: string
  displayName: string
  sortOrder: number
  status: "active" | "removed"
  createdAt: Date
  removedAt?: Date
}
```

Notes:

- `sortOrder` preserves insertion order.
- Displayed position should be derived from active entries.
- Removed entries should not be hard-deleted.

### 6.5 BoardEvent

Represents an auditable board action.

Suggested fields:

```ts
BoardEvent {
  id: string
  boardId: string

  actorType: "public" | "admin" | "system"
  actorAdminUserId?: string

  type:
    | "entry_added"
    | "entry_removed"
    | "entry_restored"
    | "board_reset"
    | "board_opened"
    | "board_closed"
    | "access_rotated"

  entryId?: string
  displayNameSnapshot?: string
  publicMessage: string

  createdAt: Date
}
```

Notes:

- Store `displayNameSnapshot` so logs remain readable even if entries later change.
- Public logs should not reveal sensitive metadata.

### 6.6 Private Audit Metadata

Used for rate limiting, abuse detection, and staff review.

Suggested fields:

```ts
AuditMetadata {
  id: string
  eventId: string
  ipHash?: string
  userAgentHash?: string
  sessionId?: string
  createdAt: Date
}
```

Notes:

- Avoid treating this as identity.
- Use hashes where practical.
- Do not expose this in public logs.

---

## 7. Admin and Access Model

### 7.1 Admin Users

Admin users are staff/operator accounts. Participants do not have accounts.

Suggested fields:

```ts
AdminUser {
  id: string
  email: string
  displayName: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}
```

### 7.2 Memberships and Roles

Admin access should be scoped by organization and optionally venue.

Suggested fields:

```ts
AdminMembership {
  id: string
  adminUserId: string
  organizationId: string
  venueId?: string
  role: "org_owner" | "venue_manager" | "venue_staff"
  createdAt: Date
  updatedAt: Date
}
```

If `venueId` is null, the role applies organization-wide.

### 7.3 Role Capabilities

#### Organization Owner

Can:

- manage organization settings
- create/edit venues
- create/edit boards across venues
- manage organization staff
- view all logs/history
- configure organization-level settings

#### Venue Manager

Can:

- manage boards in assigned venue
- manage venue staff
- reset queues
- rotate QR/access credentials
- view venue logs/history

#### Venue Staff

Can:

- operate assigned venue boards
- open/close boards
- reset queues
- remove entries
- view board activity/history

---

## 8. Product Surfaces

Queue Reminiscence should have three main surfaces.

### 8.1 Public Board UI

Audience: participants.

Requirements:

- mobile-first
- no login
- QR entry point
- view current queue
- add display name if access is valid
- remove active entries if access is valid
- collapsible recent activity
- clear board open/closed state

Example route:

```text
/b/:publicSlug
```

Example dynamic QR route:

```text
/q/:accessCode
```

### 8.2 Admin Operator UI

Audience: arcade operators/staff.

Requirements:

- login required
- separate web UI from public board
- may run on separate port or subdomain
- manage organizations/venues/boards according to role
- generate QR codes
- rotate access credentials
- inspect logs/history

Possible development deployment:

```text
Public app:  :3000
Admin app:   :3001
API/backend: internal service or shared backend
```

Possible production deployment:

```text
Public: https://queue.example.com
Admin:  https://admin.queue.example.com
```

### 8.3 Display / Integration Surface

Audience: e-ink displays, public displays, future MQTT bridge.

Requirements:

- stable display-state API
- device-specific display credentials
- current board state
- current QR/access payload when authorized
- polling-friendly responses
- eventual MQTT compatibility

---

## 9. Public Board UX Requirements

### 9.1 Board Page

The board page should show:

- organization/venue context where useful
- board name
- board status
- active queue entries
- add-name button
- remove button per active entry, if mutation access is valid
- last updated time
- recent activity section collapsed by default

Suggested layout:

```text
[Venue Name]
[Board Name]
[Status: Open]

Current Queue
1. Aki              [Remove]
2. Mika             [Remove]
3. Red jacket       [Remove]

[+ Add your name]

Recent Activity ▸
```

### 9.2 Empty Queue Copy

```text
No one is waiting yet.
Be the first to join the queue.
```

### 9.3 Add Entry Copy

Button:

```text
Add your name
```

Field label:

```text
Name to show on the board
```

Helper text:

```text
Use any name people can recognize you by.
```

Submit button:

```text
Join queue
```

### 9.4 Remove Entry Copy

Button:

```text
Remove
```

Confirmation:

```text
Remove "Aki" from the queue?

Use this for no-shows, duplicates, mistakes, or if the person is done.
This action will be shown in Recent Activity.

[Cancel] [Remove]
```

Rationale:

- “Remove” is clear and neutral.
- Avoid “Delete” because entries are not hard-deleted.
- Avoid “Ghosted” as primary UI because it is too playful and ambiguous.
- Avoid “Mark absent” because not all removals are no-shows.

### 9.5 Recent Activity

Public recent activity should:

- be collapsed by default
- show the latest N events when expanded
- include add/remove/reset/open/close/access-relevant public events
- avoid sensitive metadata
- be human-readable

Example:

```text
Recent Activity ▾
14:02 — "Aki" joined.
14:05 — "Mika" joined.
14:12 — "Taro" was removed.
14:14 — Queue was reset by staff.
```

---

## 10. Queue Behavior Requirements

### 10.1 Add Entry

Participants with valid mutation access can add a display name.

Validation:

- required
- trim leading/trailing whitespace
- reject empty or whitespace-only names
- enforce max length, e.g. 32 or 40 characters
- optionally collapse repeated whitespace
- optionally reject extreme repeated characters

### 10.2 Remove Entry

Participants with valid mutation access can remove any active queue entry.

Requirements:

- require confirmation
- soft-remove the entry
- hide it from active queue
- create visible board event
- preserve entry/history

### 10.3 Reset Queue

Admin/staff can reset a board.

Requirements:

- soft-remove or close all active entries
- create visible board event
- preserve history
- require confirmation in admin UI

### 10.4 Reordering

Reordering is explicitly out of scope for MVP.

Known future use case:

- players may ask for reorder because they are busy with another game or temporarily unavailable

Future support may include:

- staff reorder
- public reorder request
- skip/pass turn
- temporary hold

---

## 11. Board Status and Modes

### 11.1 Board Status

MVP statuses:

```text
open
closed
```

Optional future statuses:

```text
paused
maintenance
full
```

### 11.2 Public Action Modes

Recommended product modes:

#### Protected Open Board

Default real-world mode.

```text
Public can view.
Public can add/remove only with current QR/access session.
Logs visible.
Rate limits active.
```

#### Open Board

Physical-board behavior without fresh access requirement.

```text
Public can view.
Anyone with board URL can add/remove.
Logs visible.
Rate limits active.
```

Useful for trusted/local demos, but less secure.

#### Add-Only Board

```text
Public can add.
Only staff/admin can remove.
```

Useful during deletion abuse.

#### Staff-Controlled Board

```text
Public can view.
Only staff/admin can add/remove.
```

Useful for formal or high-abuse venues.

#### Closed Board

```text
Public can view closed state.
No public actions.
```

---

## 12. Dynamic QR and Public Access Credentials

### 12.1 Requirement

Queue Reminiscence should support dynamic QR access credentials for public queue mutation actions.

This enables e-ink displays and staff-controlled QR rotation while preserving no-account participation.

### 12.2 Stable Board Identity vs Fresh Access

Stable board identity:

```text
Echo EX10 MBK / CHUNITHM Gold
```

Readable board URL:

```text
/b/echo-mbk-chunithm-gold
```

Fresh access URL:

```text
/q/ECHO-MBK-CHU-G7K2
```

The readable board URL may allow viewing.  
The fresh access URL grants the ability to add/remove, usually by creating a short-lived browser session.

### 12.3 Access Flow

1. User scans current QR.
2. Browser opens `/q/:accessCode`.
3. Server validates access code.
4. Server identifies the board.
5. Server creates a short-lived board mutation session.
6. User lands on the board page.
7. User can add/remove entries while session is valid.

### 12.4 Expired Access Behavior

If a user opens an expired QR/access link:

```text
This queue link is no longer active for editing.

You can still view the board, but adding or removing names requires scanning the current on-site QR code.
```

The system should degrade to view-only board access when possible.

### 12.5 Manual QR Rotation

Staff/admin can rotate a board’s public access credential.

Confirmation copy:

```text
Rotate public QR link?

Old QR links will no longer allow adding or removing names.
You will need to print or display the new QR code.

[Cancel] [Rotate QR]
```

### 12.6 Scheduled QR Rotation

Future board setting:

```text
Never / Manual only
Every 15 minutes
Every 30 minutes
Every 1 hour
Every 4 hours
Daily at configured time
```

For paper QR deployments, use manual rotation.

For e-ink deployments, scheduled rotation becomes practical.

### 12.7 BoardAccessCredential

Suggested fields:

```ts
BoardAccessCredential {
  id: string
  boardId: string
  tokenHash: string
  tokenPreview: string
  version: number
  status: "active" | "expired" | "revoked"
  expiresAt?: Date
  createdAt: Date
  revokedAt?: Date
  createdByAdminUserId?: string
  revokedByAdminUserId?: string
}
```

Notes:

- Store token hashes, not raw tokens, where practical.
- Keep token preview only for admin/debug display.
- Rotating credentials should create an event.

---

## 13. Troll and Abuse Handling

### 13.1 Threat Model

Known abuse cases:

1. Remote spam: attacker repeatedly adds fake names.
2. Remote mass removal: attacker removes active entries.
3. Offensive names: attacker submits slurs, harassment, or NSFW text.
4. Bot/script abuse: automated requests mutate queue endpoints.
5. Shared QR screenshot abuse: current QR is posted online.
6. Old QR abuse: stale URLs remain usable too long.
7. Targeted griefing: rival/community abuse against a venue board.

### 13.2 Anti-Abuse Philosophy

Do not solve abuse by requiring participant accounts. That would harm the core product experience.

Instead use layered defenses:

```text
fresh QR/access credentials
+ visible public logs
+ soft deletion
+ rate limits
+ staff panic modes
+ optional stronger venue gates later
```

### 13.3 Required MVP Abuse Controls

MVP should include:

- visible public activity log
- soft deletion
- admin reset
- admin open/close board
- public action rate limiting
- public mutation requiring current access credential/session
- manual QR/access rotation

### 13.4 Rate Limiting

Apply rate limits to public mutation actions.

Suggested examples:

```text
Per IP/session/board:
- max 3 adds per 1 minute
- max 10 adds per 10 minutes
- max 5 removals per 1 minute
- max 20 removals per 10 minutes

Per board:
- max 30 public mutation actions per minute
```

Exact values should be tuned during field testing.

Use multiple weak signals:

- session cookie
- IP hash
- user-agent hash
- board ID

Do not present these as durable user identity.

### 13.5 Staff Panic Controls

Admin/staff dashboard should expose emergency actions:

```text
[Rotate QR Link]
[Set Add-Only Mode]
[Set Staff-Controlled Mode]
[Reset Queue]
[Close Board]
```

### 13.6 Recovery

MVP minimum:

- preserve removed entries in history
- show add/remove events
- staff can manually recover by re-adding names if needed

Future:

- restore removed entry
- restore board state to previous point
- suspicious activity highlights

---

## 14. E-Ink and Display Support

### 14.1 Requirement

Queue Reminiscence should support future e-ink/public displays that can show:

- board name
- current queue summary
- current QR/access code
- last updated time
- queue length

Dynamic QR is especially useful for e-ink displays because they can periodically poll for a new QR and display fresh edit access on-site.

### 14.2 Display-State API

A display-state API should provide a stable payload for devices.

Example endpoint:

```text
GET /api/display/:displayToken/state
```

Example response:

```json
{
  "board": {
    "publicSlug": "echo-mbk-chunithm-gold",
    "name": "CHUNITHM Gold",
    "venueName": "Echo EX10 MBK",
    "status": "open"
  },
  "queue": [
    {
      "position": 1,
      "displayName": "Aki"
    },
    {
      "position": 2,
      "displayName": "Mika"
    }
  ],
  "queueLength": 2,
  "publicAccess": {
    "url": "https://queue.example.com/q/ECHO-MBK-CHU-G7K2",
    "qrSvgUrl": "https://queue.example.com/api/qr/ECHO-MBK-CHU-G7K2.svg",
    "expiresAt": "2026-06-13T12:00:00Z",
    "version": 12
  },
  "updatedAt": "2026-06-13T11:45:00Z",
  "displayVersion": 42
}
```

### 14.3 QR Rendering Endpoints

Useful endpoints:

```text
GET /api/qr/:accessCode.svg
GET /api/qr/:accessCode.png
```

Devices may also generate QR locally from the public access URL.

### 14.4 Polling Behavior

Recommended e-ink behavior:

```text
Poll every 30–120 seconds.
Refresh display only if displayVersion or updatedAt changed.
```

HTTP caching should be supported where practical:

```text
ETag: "board-display-42"
If-None-Match: "board-display-42"
304 Not Modified
```

### 14.5 Display Device Authentication

Display devices should use separate credentials from public participant access.

Suggested model:

```ts
DisplayDevice {
  id: string
  boardId: string
  name: string
  tokenHash: string
  status: "active" | "revoked"
  lastSeenAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

Reasoning:

- public QR tokens should not authorize device APIs
- display devices may need current QR/access info
- staff can revoke one display independently
- leaked public links should not expose display credentials

### 14.6 MQTT Future

Future MQTT topics may include:

```text
queue-reminiscence/orgs/{orgSlug}/venues/{venueSlug}/boards/{boardSlug}/display-state
queue-reminiscence/orgs/{orgSlug}/venues/{venueSlug}/boards/{boardSlug}/events
```

MQTT caution:

- do not publish public mutation tokens on broadly readable topics
- use broker ACLs if QR/access payloads are published
- prefer HTTP polling for MVP unless MQTT is specifically needed

---

## 15. Admin UI Requirements

### 15.1 Login

Route example:

```text
/admin/login
```

Requirements:

- email/username
- password
- secure password hashing
- session/cookie auth
- logout

### 15.2 Dashboard

Route example:

```text
/admin
```

Shows:

- organizations/venues available to user
- board list
- board status
- active queue count
- recent activity
- quick actions

### 15.3 Venue Management

For authorized roles:

- create venue
- edit venue name/slug/timezone
- view venue boards
- manage venue staff

### 15.4 Board Management

Routes examples:

```text
/admin/boards
/admin/boards/new
/admin/boards/:id
/admin/boards/:id/live
```

Actions:

- create board
- edit board name
- edit board slug/public slug
- open/close board
- reset board
- generate QR code
- rotate QR/access credential
- configure board action mode
- view public URL
- view live queue
- view full event history

### 15.5 Staff Management

Owner/manager-only depending on scope.

Actions:

- create staff account
- disable staff account
- change role
- reset password, later

---

## 16. Public API Sketch

### 16.1 Public Board Read

```text
GET /api/boards/:publicSlug
GET /api/boards/:publicSlug/events
GET /api/boards/:publicSlug/display-state
```

### 16.2 Access Code Flow

```text
GET /q/:accessCode
```

Validates access code and creates board mutation session.

### 16.3 Public Mutations

Require valid access session or credential.

```text
POST /api/boards/:publicSlug/entries
DELETE /api/boards/:publicSlug/entries/:entryId
```

or soft-removal route:

```text
POST /api/boards/:publicSlug/entries/:entryId/remove
```

### 16.4 Admin API

Authenticated admin routes for:

- organizations
- venues
- boards
- queue entries
- events/history
- QR/access credential rotation
- staff management

Exact API shape can be decided during technical design.

---

## 17. Deployment Direction

The project is not yet committed to SaaS or self-host only.

Initial direction:

- test through a local community demo
- build as a single deployable app/system
- use a SaaS-compatible data model
- avoid public signup and billing in MVP

Recommended approach:

```text
Single deployment
  -> supports Organization / Venue / Board internally
  -> admin UI may initially expose only one organization
  -> future SaaS path remains open
```

---

## 18. MVP Scope

### 18.1 Participant Features

Required:

- scan current QR/access link
- open board page
- view board name/status
- view active queue
- add arbitrary display name
- remove active queue entry with confirmation
- expand/collapse recent activity log
- see expired/access-invalid state clearly

### 18.2 Admin Features

Required:

- admin login/logout
- organization/venue/board-aware permissions
- create/edit boards
- assign readable slugs/public slugs
- generate QR/access links
- rotate QR/access credentials manually
- open/close boards
- reset queues
- remove entries
- view detailed event history
- basic staff account support

### 18.3 System Features

Required:

- mobile-first public UI
- separate admin UI
- readable board slugs
- dynamic QR/access code model
- soft deletion
- visible event logging
- public mutation rate limiting
- display-state API suitable for e-ink/MQTT future
- QR rendering endpoint or QR payload support

---

## 19. Out of Scope for MVP

Explicitly out of scope:

- participant registration
- participant login
- participant identity verification
- public self-service board creation
- public SaaS signup
- billing/subscriptions
- individual notifications
- queue reordering
- reservation time slots
- native mobile app
- mandatory daily auto-reset
- advanced analytics
- geolocation enforcement
- Wi-Fi-only enforcement
- CAPTCHA by default
- MQTT publishing as a required MVP feature
- automatic abuse detection beyond basic rate limits

---

## 20. Future Features

Potential future work:

- e-ink display device registration UI
- scheduled QR rotation
- MQTT publishing adapter
- queue reorder / pass / hold turn
- restore removed entry
- restore board to previous state
- suspicious activity dashboard
- profanity/content moderation settings
- venue-specific branding
- public display screen mode
- custom domains for SaaS
- organization billing/subscriptions
- audit exports
- API/webhooks
- passkeys or 2FA for admin users

---

## 21. Open Questions

These are not blockers for the PRD, but should be resolved during design/build:

1. What exact tech stack should be used?
2. Should the initial admin UI be a fully separate app/package or a separate route served by the same backend?
3. What should the first local demo deployment environment be?
4. What initial rate-limit thresholds are appropriate for real arcade traffic?
5. How long should board mutation sessions last after scanning QR?
6. Should public view by stable board URL always be allowed, or should some boards require current access even to view?
7. What is the ideal QR rotation interval for e-ink deployments?
8. How much queue history should be retained?
9. Should removed entries be restorable in MVP or V1?
10. What languages/locales should be supported first?

---

## 22. Current Recommended Defaults

| Area                 | Recommended Default                         |
| -------------------- | ------------------------------------------- |
| Product name         | Queue Reminiscence                          |
| Participant accounts | None                                        |
| Board creation       | Admin/operator only                         |
| Hierarchy            | Organization -> Venue -> Board              |
| Public board URL     | Readable public slug                        |
| Public edit access   | Current QR/access credential required       |
| Board mode           | Protected Open Board                        |
| Removal wording      | Remove                                      |
| Removal behavior     | Soft-remove                                 |
| Public log           | Collapsible, collapsed by default           |
| Admin accounts       | Required                                    |
| Admin UI             | Separate web UI/subdomain/port              |
| QR rotation          | Manual in MVP, scheduled later              |
| E-ink support        | Design in MVP, full device management later |
| Auto-reset           | Manual only for MVP                         |
| Notifications        | Out of scope                                |
| Initial deployment   | Local community demo                        |
| Future path          | SaaS-compatible data model                  |

---

## 23. Definition of Done for MVP

MVP is done when:

- An admin can log in.
- An admin can create an organization/venue/board structure, even if seeded initially.
- An admin can create and manage boards.
- A board has a readable public identity.
- A board has a current QR/access link.
- A participant can scan/open the current QR/access link.
- A participant can view the board before adding a name.
- A participant can add an arbitrary display name without account registration.
- A participant can remove any active queue entry with confirmation.
- Removed entries disappear from active queue but remain in history.
- Add/remove/reset/open/close/access-rotation actions are logged.
- Public recent activity is available but collapsed by default.
- Public mutation actions are rate-limited.
- Admin/staff can reset and open/close boards.
- Admin/staff can rotate the QR/access credential.
- Expired access links do not allow mutation.
- A display-state endpoint exists with a stable payload suitable for future e-ink/MQTT integration.

---

## 24. Short Product Description

Queue Reminiscence is a digital arcade queue board system that preserves the feel of paper queue sheets while adding QR access, public action logs, staff controls, and future e-ink display support. Participants scan the current on-site QR code, write any recognizable name, and may remove ghost entries without creating an account. Operators manage official boards, staff accounts, queue resets, and dynamic QR access from a separate admin interface.
