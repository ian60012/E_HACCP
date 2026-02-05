# Project Context: FD Catering HACCP eQMS System

## 1. Project Overview
We are building an **Electronic Quality Management System (eQMS)** for a food manufacturing facility in Melbourne. The goal is to digitize paper-based HACCP logs into a centralized, tamper-proof digital system hosted on a local **Synology NAS via Docker**.

**Core Objective:** Replace paper logs (Cooking, Cooling, Receiving) with digital forms that perform real-time validation against Critical Control Points (CCPs).

## 2. Technical Stack (Strict Constraints)
The system must run in a low-resource environment (NAS) and be easy to maintain.

* **Infrastructure:** Docker & Docker Compose (Production environment is a local NAS).
* **Database:** PostgreSQL 15+ (Relational data is critical for audit trails).
* **Backend:** Python 3.11+ using **FastAPI**.
    * ORM: SQLAlchemy (Async).
    * Validation: Pydantic v2.
* **Frontend:** **Vue 3** (Composition API) + TypeScript.
    * UI Framework: TailwindCSS + Headless UI (or Naive UI).
    * State Management: Pinia.
* **Tools:** Adminer (for DB viewing), Pytest (for testing).

## 3. Domain Logic & HACCP Rules (Crucial)
The system is governed by FSANZ (Food Standards Australia New Zealand) and the company's HACCP plan.

### Core Concept: CCP (Critical Control Point)
A CCP is a step where control can be applied and is essential to prevent or eliminate a food safety hazard.
* **Pass:** Recorded value meets the limit.
* **Fail (Deviation):** Recorded value violates the limit. **MUST trigger a "Deviation Record" immediately.**

### Key Workflows to Implement (MVP)
#### A. Cooking Log (Ref: FSP-LOG-004)
* **Trigger:** Per batch.
* **Inputs:** Batch No, Product Name, Start Time, Finish Time, **Core Temperature**.
* **Logic:**
    * IF `Core Temperature` >= 90.0°C -> **Pass**.
    * IF `Core Temperature` < 90.0°C -> **Fail/Deviation**. System must prompt for "Corrective Action" (e.g., "Continue cooking").

#### B. Cooling Log (Ref: FSP-LOG-005)
* **Trigger:** Per batch (linked to Cooking Batch).
* **Inputs:** Start Temp (approx 60°C), 2-Hour Temp, 4-Hour Temp.
* **Logic:**
    * **Stage 1:** Must cool from 60°C to 21°C within 2 hours.
    * **Stage 2:** Must cool from 21°C to 5°C within the next 4 hours (Total 6 hours).
    * **Fail:** If limits exceeded -> Trigger Deviation (Action: "Discard" or "Blast Freeze immediately").

## 4. Database Schema Design (Initial Draft)

We need a normalized schema. Do not use NoSQL features unless necessary for JSON logs.

```sql
-- Table: users
id, username, role (Operator, QA, Manager), password_hash, is_active

-- Table: products
id, name (e.g., "Pork Dumplings"), ccp_limit_temp (default 90.0), is_active

-- Table: cooking_logs
id, batch_no (Unique), product_id, operator_id, start_time, end_time, core_temp, status (PASS/FAIL)

-- Table: deviations (CAPA)
id, related_log_id (Polymorphic or specific FK), log_type (Cooking/Cooling), reason, action_taken, verified_by_id

##5. Coding Standards
Backend:

Use purely async/await.

Strict Type hinting (def func() -> str:).

Use Pydantic models for all API Request/Response schemas.

API endpoints should be versioned (e.g., /api/v1/cooking-logs).

Frontend:

Use <script setup lang="ts">.

Components must be modular.

Forms must have client-side validation AND server-side error handling.

##6. Immediate Task: Phase 1 (MVP Setup)
Please assist me in setting up the project structure:

Create a docker-compose.yml with FastAPI, PostgreSQL, and Adminer.

Initialize the FastAPI project structure with SQLAlchemy async engine.

Create the database models for User, Product, and CookingLog.

Create a basic API endpoint to submit a CookingLog and test the CCP logic (90°C limit).