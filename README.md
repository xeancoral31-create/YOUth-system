# BGCyouth — Butuan Gospel Church Youth Inventory & Auditing System

A full-stack, database-integrated **Inventory, Auditing, Automated History Archiving, and Financial Reporting System** built for **Butuan Gospel Church Youth Ministry (BGCyouth)**. Designed with a formal, responsive UI, Philippine Peso (`₱`) currency formatting, role-based access control (RBAC), atomic SQLite transactions, editable Word (`.docx`) / PDF / Excel (`.xlsx`) exports, and Android APK / PWA support.

---

## System Architecture & Network Topology

```mermaid
flowchart LR
    subgraph Clients["Client Layer"]
        WEB["Web Browser\n(React 18 + Vite + Tailwind CSS)"]
        APK["Android App / PWA\n(Capacitor 6 + Manifest)"]
    end

    subgraph Server["Application Server (Node.js v24 + Express 5)"]
        AUTH["Auth & RBAC Middleware\n(JWT Cookie / Bearer + bcryptjs)"]
        API["REST API Routes\n(/api/inventory, /api/audits, /api/reports,\n/api/history, /api/documents, /api/system)"]
        ARCHIVE["Archive & Reset Service\n(Atomic Snapshot & Period Reset)"]
        SCHED["Weekly Sunday Scheduler\n(15-min interval, idempotent)"]
        EXPORTS["Document Generators\n(PDFKit • ExcelJS • docx)"]
    end

    subgraph Storage["Persistence Layer (Local Disk)"]
        DB[("SQLite Database\nbgcyouth.db (WAL + FK)")]
        FILES["Generated & Backup Files\n(/uploads/generated, /backups)"]
    end

    WEB -->|HTTP / JSON| AUTH
    APK -->|HTTP + Bearer Token| AUTH
    AUTH --> API
    API --> ARCHIVE
    SCHED --> ARCHIVE
    API --> EXPORTS
    ARCHIVE --> DB
    API --> DB
    EXPORTS --> FILES
    API --> FILES
```

---

## End-to-End System Flowcharts

### 1. Inventory & Auditing Lifecycle

```mermaid
flowchart TD
    A["Authorized User Sign In\n(POST /api/auth/login)"] --> B["Dashboard\nLive KPIs & Valuation Chart"]
    B --> C["Inventory Items\nManual Entry + Auto Total (Qty × Price)"]
    C --> D{"Duplicate Check\n(Name + Unit + Unit Price)"}
    D -->|Identical| E["409 Blocked\nPrevent Accidental Duplicate"]
    D -->|Unique or Different Price| F["Saved to inventory_items\n+ inventory_transactions"]
    F --> G["Stock Adjustments\n(Stock In / Out / Damage / Count)"]
    F --> H["Create Inventory Audit\n(Snapshot Recorded Qty & Value)"]
    H --> I["Enter Actual Counts\n& Observed Conditions"]
    I --> J["Finalize & Lock Audit\n(POST /api/audits/:id/finalize)"]
    J --> K["Auto-Archive to History\n& Reset Active Inventory"]
```

### 2. Automated Inventory Reset & History Archiving Flow

```mermaid
flowchart TD
    T1["Trigger 1: Admin Prints A4 Report\n(POST /api/reports/print-archive)"] --> SVC
    T2["Trigger 2: Audit Finalized\n(POST /api/audits/:id/finalize)"] --> SVC
    T3["Trigger 3: Weekly Sunday Schedule\n(weeklyScheduler.ts)"] --> SVC

    SVC["archiveAndResetInventory()\n(BEGIN IMMEDIATE Transaction)"] --> DUP{"Unique archive_ref\nalready exists?"}
    DUP -->|Yes| SKIP["Return Existing Archive\n(Duplicate Prevented)"]
    DUP -->|No| SNAP["Snapshot inventory_items\n& audit_details_json"]
    SNAP --> VERIFY{"Inserted count ==\nActive item count?"}
    VERIFY -->|No| ROLLBACK["ROLLBACK Transaction\nPreserve Active Inventory + Error"]
    VERIFY -->|Yes| RESET["DELETE FROM inventory_items\n+ Log Deletion & Activity"]
    RESET --> COMMIT["COMMIT Transaction\nDashboard & Inventory Reset to ₱0.00"]
```

---

## Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    users ||--o{ inventory_items : creates_updates
    users ||--o{ inventory_transactions : performs
    users ||--o{ audits : conducts_finalizes
    users ||--o{ documents : generates
    users ||--o{ activity_logs : logs
    users ||--o{ inventory_history_archives : archives

    inventory_items ||--o{ inventory_transactions : tracks
    inventory_items ||--o{ audit_items : audited_in

    audits ||--o{ audit_items : contains
    audits ||--o{ audit_history : records
    audits ||--o{ inventory_history_archives : triggers

    inventory_history_archives ||--o{ inventory_history_items : snapshots

    users {
        int id PK
        text username UK
        text full_name
        text email UK
        text password_hash
        text role
        text position
        int is_active
    }

    inventory_items {
        int id PK
        text item_code UK
        text item_name
        text description
        text category
        real quantity
        text unit
        real unit_price
        real total_value
        real min_stock_level
        text supplier
        text date_purchased
        text condition
    }

    inventory_transactions {
        int id PK
        int item_id FK
        text item_name
        text transaction_type
        real previous_qty
        real change_qty
        real new_qty
        real total_value_after
        text reason
    }

    audits {
        int id PK
        text audit_ref UK
        text title
        text audit_date
        text auditor_name
        text status
        text findings
        text recommendations
        text approved_by
        text finalized_at
    }

    audit_items {
        int id PK
        int audit_id FK
        int inventory_item_id FK
        real recorded_qty
        real actual_qty
        real discrepancy
        real financial_difference
        text observed_condition
    }

    inventory_history_archives {
        int id PK
        text archive_ref UK
        text period_label
        text trigger_type
        int audit_id FK
        text audit_ref
        int registered_item_count
        real total_inventory_value
        int is_hidden
        text archived_at
    }

    inventory_history_items {
        int id PK
        int archive_id FK
        int original_item_id
        text item_name
        real quantity
        text unit
        real unit_price
        real total_value
        text supplier
        text condition
    }

    documents {
        int id PK
        text title
        text doc_type
        text reference_no
        text file_name
        text file_path
        int file_size
    }

    system_settings {
        text key PK
        text value
    }

    activity_logs {
        int id PK
        int user_id FK
        text username
        text action
        text module
        text details
    }
```

---

## Core Features & Modules

1. **Dashboard (`/`):** Live SQLite-backed KPIs (`Registered Items`, `Inventory Value`, `Completed Audits`, `Pending Audits`), Recharts **Inventory Valuation Overview**, **Recent Activity**, and **Recently Registered Items**.
2. **Inventory Items (`/inventory`):** Manual item registration (no prefilled fake data), automatic `total_value = quantity × unit_price`, price-aware duplicate blocking (same item allowed at different unit prices; identical name + unit + price blocked), search, condition filtering, sorting, CSV export, stock adjustments, and transaction history.
3. **Inventory Audits (`/audits`, `/audits/:id`):** Physical count verification, automatic discrepancy & financial variance (`₱`) calculation, findings/recommendations, irreversible **Finalize & Lock** (`403` protection), optional inventory reconciliation, and automatic History archiving on completion.
4. **Reports & Financial Summary (`/reports`):** Official A4 print layout with **Butuan Gospel Church • BGC Youth Ministry** letterhead, **Church Board** signatory block, **Export Word (`.docx`)**, **Download PDF**, **Export Excel (`.xlsx`)**, and **Print A4** (automatically archives & resets active inventory for Administrators).
5. **History Archives (`/history`):** Independent historical snapshots organized by date, period, and activity trigger (`Print Report`, `Audit Completed`, `Weekly Sunday Reset`), with search, date/activity filters, expandable item tables, **Hide/Unhide** from default view, and **Permanent Delete** (Admin only).
6. **Document Center (`/documents`):** Centralized archive of all generated PDF, Word (`.docx`), and Excel (`.xlsx`) exports with search, type filter, preview, download, and Admin delete.
7. **System Administration (`/logs`, `/users`, `/backup`, `/settings`):**
   - **Activity Logs:** Full audit trail of logins, inventory changes, audits, exports, and resets.
   - **User Accounts:** Role-based access control (`admin`, `auditor`, `staff`, `viewer`).
   - **Backup & Recovery:** SQLite `PRAGMA integrity_check`, live `.db` snapshots (`VACUUM INTO`), and verified restore.
   - **Settings:** Profile editing, password change, organization & report defaults (`system_settings`), and personal activity log.

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, React Router v6, Lucide Icons, Recharts, Sonner
- **Backend:** Node.js v24 (`node:sqlite`), Express 5, TypeScript, JWT (`jsonwebtoken`) + `bcryptjs`, Helmet, PDFKit, ExcelJS, `docx`
- **Mobile / Offline Shell:** Capacitor 6 (`c:/BGCyouth/client/android`) + Web App Manifest (`PWA`)

---

## Setup, Build & Run

### 1. Install Dependencies
```powershell
npm --prefix server install
npm --prefix client install
```

### 2. Build Production Bundles
```powershell
npm run build
```

### 3. Start the Application
```powershell
npm start
```
Open `http://localhost:4000` in your browser.
- **Initial Administrator Account** (created automatically only when `users` is empty):
  - **Username:** ``
  - **Password:** ``
  - *(Change the password after your first sign-in under **Settings → Security & Password**.)*

### 4. Android APK Sync
To sync updated web assets into the Capacitor Android project (`c:/BGCyouth/client/android`):
```powershell
npm run apk:sync
```
Open `c:/BGCyouth/client/android` in **Android Studio** and run **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
