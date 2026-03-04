"""
PostgreSQL enum type mappings for the HACCP eQMS system.

All enums use create_type=False because the types already exist in the
database (created by database/init.sql). SQLAlchemy must NOT attempt
to CREATE TYPE — it would conflict with the existing types.

Enum values must match the PostgreSQL enum labels EXACTLY (case-sensitive).
"""

import enum
from sqlalchemy import Enum as SAEnum


# ---------------------------------------------------------------------------
# Python enum classes (mirror PostgreSQL enum types)
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    OPERATOR = "Operator"
    QA = "QA"
    MANAGER = "Manager"


class PassFail(str, enum.Enum):
    PASS = "Pass"
    FAIL = "Fail"


class Acceptance(str, enum.Enum):
    ACCEPT = "Accept"
    REJECT = "Reject"
    HOLD = "Hold"


class CCPStatus(str, enum.Enum):
    PASS = "Pass"
    FAIL = "Fail"
    DEVIATION = "Deviation"


class Severity(str, enum.Enum):
    CRITICAL = "Critical"
    MAJOR = "Major"
    MINOR = "Minor"


class ImmediateAction(str, enum.Enum):
    QUARANTINE = "Quarantine"
    HOLD = "Hold"
    DISCARD = "Discard"
    REWORK = "Rework"
    OTHER = "Other"


class Chemical(str, enum.Enum):
    BUFF = "Buff"
    HYBRID = "Hybrid"
    COMMAND = "Command"
    KEYTS = "Keyts"
    CHLORINE = "Chlorine"


class LogType(str, enum.Enum):
    RECEIVING = "receiving"
    COOKING = "cooking"
    COOLING = "cooling"
    SANITISING = "sanitising"
    ASSEMBLY = "assembly"


# ---------------------------------------------------------------------------
# SQLAlchemy column types (reusable in model definitions)
# create_type=False is CRITICAL — enums already exist in PostgreSQL
# values_callable=lambda e: [x.value for x in e] tells SQLAlchemy to use
# the enum .value (e.g., "Operator") for DB I/O instead of .name ("OPERATOR")
# ---------------------------------------------------------------------------

_vals = lambda e: [x.value for x in e]

UserRoleType = SAEnum(UserRole, name="user_role_enum", create_type=False, values_callable=_vals)
PassFailType = SAEnum(PassFail, name="pass_fail_enum", create_type=False, values_callable=_vals)
AcceptanceType = SAEnum(Acceptance, name="acceptance_enum", create_type=False, values_callable=_vals)
CCPStatusType = SAEnum(CCPStatus, name="ccp_status_enum", create_type=False, values_callable=_vals)
SeverityType = SAEnum(Severity, name="severity_enum", create_type=False, values_callable=_vals)
ImmediateActionType = SAEnum(ImmediateAction, name="immediate_action_enum", create_type=False, values_callable=_vals)
ChemicalType = SAEnum(Chemical, name="chemical_enum", create_type=False, values_callable=_vals)
LogTypeType = SAEnum(LogType, name="log_type_enum", create_type=False, values_callable=_vals)


class InvDocType(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"


class InvDocStatus(str, enum.Enum):
    DRAFT = "Draft"
    POSTED = "Posted"
    VOIDED = "Voided"


InvDocTypeType = SAEnum(InvDocType, name="inv_doc_type_enum", create_type=False, values_callable=_vals)
InvDocStatusType = SAEnum(InvDocStatus, name="inv_doc_status_enum", create_type=False, values_callable=_vals)
