import pytest

from app.services.priority import (
    SCORE_MAX,
    PriorityInputError,
    calculate_priority,
    level_for_score,
)

FULL = {
    "severity": 5,
    "people_affected": 10_000,
    "previous_complaints": 5,
    "near_school": True,
    "near_hospital": True,
    "traffic_level": "high",
    "location_type": "main_road",
}


def test_maximum_input_gives_exactly_100_and_critical():
    result = calculate_priority(FULL)
    assert result.score == 100.0
    assert result.level == "critical"
    assert result.max_score == SCORE_MAX


def test_minimum_valid_input_scores_low():
    result = calculate_priority(
        {
            "severity": 1,
            "people_affected": 0,
            "previous_complaints": 0,
            "near_school": False,
            "near_hospital": False,
            "traffic_level": "low",
            "location_type": "rural",
        }
    )
    # severity 6 + rural 3
    assert result.score == 9.0
    assert result.level == "low"


def test_breakdown_points_add_up_to_score():
    result = calculate_priority(
        {**FULL, "severity": 3, "people_affected": 250, "previous_complaints": 2,
         "near_hospital": False, "traffic_level": "medium"}
    )
    assert round(sum(item.points for item in result.breakdown), 2) == result.score
    assert [item.factor for item in result.breakdown] == [
        "severity", "people_affected", "previous_complaints", "near_school",
        "near_hospital", "traffic_level", "location_type",
    ]
    for item in result.breakdown:
        assert 0 <= item.points <= item.max_points


def test_factor_maxima_sum_to_score_range():
    result = calculate_priority(FULL)
    assert sum(item.max_points for item in result.breakdown) == SCORE_MAX


@pytest.mark.parametrize(
    "score,level",
    [(0, "low"), (24.99, "low"), (25, "medium"), (49.99, "medium"),
     (50, "high"), (74.99, "high"), (75, "critical"), (100, "critical")],
)
def test_level_boundaries(score, level):
    assert level_for_score(score) == level


def test_people_affected_uses_log_scale_and_caps():
    base = {**FULL}
    points = lambda n: next(  # noqa: E731
        i.points for i in calculate_priority({**base, "people_affected": n}).breakdown
        if i.factor == "people_affected"
    )
    assert points(0) == 0
    assert points(99) == pytest.approx(10.0, abs=0.01)
    assert points(10_000) == 20.0
    assert points(5_000_000) == 20.0  # capped
    assert points(10) < points(100) < points(1000)


def test_previous_complaints_capped_at_five():
    def prev_points(n):
        r = calculate_priority({**FULL, "previous_complaints": n})
        return next(i.points for i in r.breakdown if i.factor == "previous_complaints")

    assert prev_points(0) == 0
    assert prev_points(3) == 6
    assert prev_points(5) == 10
    assert prev_points(50) == 10


def test_school_and_hospital_add_points():
    without = calculate_priority({**FULL, "near_school": False, "near_hospital": False})
    assert without.score == 100.0 - 8.0 - 10.0


def test_missing_optional_fields_use_documented_defaults_and_are_flagged():
    result = calculate_priority({"severity": 3})
    flagged = {i.factor for i in result.breakdown if i.defaulted}
    assert flagged == {
        "people_affected", "previous_complaints", "near_school",
        "near_hospital", "traffic_level", "location_type",
    }
    # severity 18 + location "other" 4; everything else 0
    assert result.score == 22.0
    assert result.level == "low"


def test_none_and_blank_optional_values_count_as_missing():
    result = calculate_priority({"severity": 2, "people_affected": None, "traffic_level": "  "})
    assert result.score == 12.0 + 4.0


def test_severity_is_required_and_never_guessed():
    with pytest.raises(PriorityInputError) as exc:
        calculate_priority({})
    assert any("severity is required" in e for e in exc.value.errors)


@pytest.mark.parametrize("bad", [0, 6, -1, 2.5, "abc", True, float("nan")])
def test_invalid_severity_rejected(bad):
    with pytest.raises(PriorityInputError):
        calculate_priority({"severity": bad})


def test_all_invalid_fields_are_reported_together():
    with pytest.raises(PriorityInputError) as exc:
        calculate_priority(
            {"severity": 9, "people_affected": -4, "previous_complaints": "x",
             "near_school": "maybe", "near_hospital": 7,
             "traffic_level": "extreme", "location_type": "moon"}
        )
    assert len(exc.value.errors) == 7


def test_numeric_strings_and_bool_strings_are_accepted():
    result = calculate_priority(
        {"severity": "4", "people_affected": "100", "near_school": "true"}
    )
    assert result.breakdown[0].points == 24.0
    assert result.breakdown[3].points == 8.0


def test_result_structure_is_consistent_and_serialisable():
    for payload in (FULL, {"severity": 1}):
        data = calculate_priority(payload).to_dict()
        assert set(data) == {"score", "level", "max_score", "breakdown"}
        assert all(
            set(item) == {"factor", "label", "input_value", "points", "max_points", "note", "defaulted"}
            for item in data["breakdown"]
        )
