"""Priority engine for civic complaints.

This module is pure Python: no database, no web framework. That makes it easy
to test and to explain.

SCORING FORMULA (score range 0 to 100)
--------------------------------------
score = severity + affected_people + previous_complaints
        + school + hospital + traffic + location_type

Factor                 Max   Rule
---------------------  ----  ------------------------------------------------
Severity (1-5)          30   30 * severity / 5            -> 6, 12, 18, 24, 30
People affected         20   20 * log10(1 + n) / log10(1 + 10000), capped at 20
                             (log scale: 0 -> 0, 100 -> 10, 10000+ -> 20)
Previous complaints     10   2 points each, capped at 5 complaints
Near a school            8   8 if yes, else 0
Near a hospital         10   10 if yes, else 0
Traffic level           10   low 0, medium 5, high 10
Location type           12   main road 12, public space 9, commercial 8,
                             industrial 7, residential 6, other 4, rural 3
                       ----
Total                  100

PRIORITY LEVELS
---------------
    0 - 24.99  -> low
   25 - 49.99  -> medium
   50 - 74.99  -> high
   75 - 100    -> critical

INPUT HANDLING
--------------
* ``severity`` is required (whole number 1-5). If it is missing or invalid,
  ``PriorityInputError`` is raised. We never guess a severity.
* Optional fields use documented neutral defaults when they are missing:
  people_affected = 0, previous_complaints = 0, near_school = False,
  near_hospital = False, traffic_level = "low", location_type = "other".
  Every defaulted field is marked as such in the breakdown.
* A value that is present but invalid (e.g. severity 9, traffic "extreme")
  raises ``PriorityInputError`` listing every problem found.

Every successful call returns a ``PriorityResult`` with the same structure:
``score``, ``level``, ``max_score`` and a ``breakdown`` list whose points add
up exactly to ``score``.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

SCORE_MIN = 0.0
SCORE_MAX = 100.0

MAX_SEVERITY_POINTS = 30.0
MAX_PEOPLE_POINTS = 20.0
PEOPLE_AT_MAX = 10_000
MAX_PREVIOUS_POINTS = 10.0
POINTS_PER_PREVIOUS = 2.0
PREVIOUS_CAP = 5
SCHOOL_POINTS = 8.0
HOSPITAL_POINTS = 10.0

TRAFFIC_POINTS = {"low": 0.0, "medium": 5.0, "high": 10.0}
LOCATION_POINTS = {
    "main_road": 12.0,
    "public_space": 9.0,
    "commercial": 8.0,
    "industrial": 7.0,
    "residential": 6.0,
    "other": 4.0,
    "rural": 3.0,
}

# (lower bound inclusive, level) checked from highest to lowest
LEVEL_THRESHOLDS = [(75.0, "critical"), (50.0, "high"), (25.0, "medium"), (0.0, "low")]

DEFAULTS = {
    "people_affected": 0,
    "previous_complaints": 0,
    "near_school": False,
    "near_hospital": False,
    "traffic_level": "low",
    "location_type": "other",
}


class PriorityInputError(ValueError):
    """Raised when the priority inputs are missing or invalid."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass(frozen=True)
class FactorScore:
    factor: str
    label: str
    input_value: str
    points: float
    max_points: float
    note: str
    defaulted: bool = False


@dataclass(frozen=True)
class PriorityResult:
    score: float
    level: str
    max_score: float = SCORE_MAX
    breakdown: list[FactorScore] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Input normalisation
# --------------------------------------------------------------------------- #
def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _as_int(value: Any, name: str, lo: int, hi: int | None, errors: list[str]) -> int | None:
    if isinstance(value, bool):
        errors.append(f"{name} must be a whole number, not true/false.")
        return None
    try:
        if isinstance(value, str):
            number = float(value.strip())
        else:
            number = float(value)
    except (TypeError, ValueError):
        errors.append(f"{name} must be a whole number.")
        return None
    if math.isnan(number) or math.isinf(number) or number != int(number):
        errors.append(f"{name} must be a whole number.")
        return None
    integer = int(number)
    if integer < lo or (hi is not None and integer > hi):
        bound = f"between {lo} and {hi}" if hi is not None else f"at least {lo}"
        errors.append(f"{name} must be {bound}.")
        return None
    return integer


def _as_bool(value: Any, name: str, errors: list[str]) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
        return value.strip().lower() == "true"
    errors.append(f"{name} must be true or false.")
    return None


def _as_choice(value: Any, name: str, allowed: Mapping[str, float], errors: list[str]) -> str | None:
    key = value.value if hasattr(value, "value") else value
    if isinstance(key, str) and key.strip().lower() in allowed:
        return key.strip().lower()
    errors.append(f"{name} must be one of: {', '.join(allowed)}.")
    return None


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def level_for_score(score: float) -> str:
    """Map a numeric score (0-100) to a priority level."""
    for lower, level in LEVEL_THRESHOLDS:
        if score >= lower:
            return level
    return "low"  # unreachable for scores >= 0, kept so every branch returns a level


def calculate_priority(data: Mapping[str, Any]) -> PriorityResult:
    """Calculate the priority of a complaint.

    Raises ``PriorityInputError`` for missing/invalid input. Otherwise always
    returns a ``PriorityResult`` with the same structure.
    """
    errors: list[str] = []
    defaulted: set[str] = set()

    def get(key: str) -> Any:
        value = data.get(key)
        if _is_missing(value) and key in DEFAULTS:
            defaulted.add(key)
            return DEFAULTS[key]
        return value

    # severity is mandatory
    if _is_missing(data.get("severity")):
        errors.append("severity is required (a whole number from 1 to 5).")
        severity = None
    else:
        severity = _as_int(data.get("severity"), "severity", 1, 5, errors)

    people = _as_int(get("people_affected"), "people_affected", 0, None, errors)
    previous = _as_int(get("previous_complaints"), "previous_complaints", 0, None, errors)
    school = _as_bool(get("near_school"), "near_school", errors)
    hospital = _as_bool(get("near_hospital"), "near_hospital", errors)
    traffic = _as_choice(get("traffic_level"), "traffic_level", TRAFFIC_POINTS, errors)
    location = _as_choice(get("location_type"), "location_type", LOCATION_POINTS, errors)

    if errors:
        raise PriorityInputError(errors)

    # All inputs are valid from here on; compute each factor.
    assert severity is not None and people is not None and previous is not None
    assert school is not None and hospital is not None and traffic is not None and location is not None

    people_points = MAX_PEOPLE_POINTS * min(
        1.0, math.log10(1 + people) / math.log10(1 + PEOPLE_AT_MAX)
    )
    previous_points = min(previous, PREVIOUS_CAP) * POINTS_PER_PREVIOUS

    breakdown = [
        FactorScore(
            "severity", "Severity", f"{severity} of 5",
            round(MAX_SEVERITY_POINTS * severity / 5, 2), MAX_SEVERITY_POINTS,
            "30 x severity / 5",
        ),
        FactorScore(
            "people_affected", "People affected", str(people),
            round(people_points, 2), MAX_PEOPLE_POINTS,
            "Log scale; 10,000 or more people earns the full 20 points",
            "people_affected" in defaulted,
        ),
        FactorScore(
            "previous_complaints", "Previous complaints", str(previous),
            round(previous_points, 2), MAX_PREVIOUS_POINTS,
            "2 points per earlier complaint, up to 5 complaints",
            "previous_complaints" in defaulted,
        ),
        FactorScore(
            "near_school", "Near a school", "yes" if school else "no",
            SCHOOL_POINTS if school else 0.0, SCHOOL_POINTS,
            "8 points if a school is nearby",
            "near_school" in defaulted,
        ),
        FactorScore(
            "near_hospital", "Near a hospital", "yes" if hospital else "no",
            HOSPITAL_POINTS if hospital else 0.0, HOSPITAL_POINTS,
            "10 points if a hospital is nearby",
            "near_hospital" in defaulted,
        ),
        FactorScore(
            "traffic_level", "Traffic level", traffic.capitalize(),
            TRAFFIC_POINTS[traffic], max(TRAFFIC_POINTS.values()),
            "Low 0, medium 5, high 10",
            "traffic_level" in defaulted,
        ),
        FactorScore(
            "location_type", "Location type", location.replace("_", " ").capitalize(),
            LOCATION_POINTS[location], max(LOCATION_POINTS.values()),
            "Busier, more public places score higher (max 12)",
            "location_type" in defaulted,
        ),
    ]

    # The score is the exact sum of the displayed points, so they always agree.
    score = round(sum(item.points for item in breakdown), 2)
    score = min(max(score, SCORE_MIN), SCORE_MAX)
    return PriorityResult(score=score, level=level_for_score(score), breakdown=breakdown)
