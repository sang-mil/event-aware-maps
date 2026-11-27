"""길 안내 분배 테스트. 인원은 가짜 테스트 값이다."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from publish.schema import errors_of  # noqa: E402
from recommend import compare, share  # noqa: E402


def s(expected, baseline=100):
    r = expected / baseline
    return {"baseline": baseline, "expected": expected, "ratio": r,
            "level": "crowded" if r >= 1.5 else "relaxed" if r < 0.8 else "normal",
            "weekday_fallback": False, "effect_unknown": False}


def opt(expected, baseline=100):
    return {"s": s(expected, baseline)}


def test_share_follows_headroom_before_crowded():
    # 남는 여유: 150-50=100, 150-100=50, 150-200=0(이미 혼잡)
    assert share.shares([opt(50), opt(100), opt(200)]) == [0.67, 0.33, 0.0]


def test_all_crowded_gives_more_to_less_crowded():
    got = share.shares([opt(200), opt(400)])          # 1/2 : 1/4 = 2 : 1
    assert got == [0.67, 0.33] and sum(got) == pytest.approx(1)


def test_sum_is_exactly_one_after_rounding():
    got = share.shares([opt(100), opt(100), opt(100)])
    assert sum(got) == pytest.approx(1.0) and got.count(0.33) == 2


def test_far_walk_option_gets_zero_for_that_venue():
    opts = [opt(50), opt(100)]
    walks = [{"near": {"walk_min": 10, "distance_m": 600}, "far": {"walk_min": 12, "distance_m": 700}},
             {"near": {"walk_min": 15, "distance_m": 900}, "far": {"walk_min": share.MAX_WALK_MIN + 7, "distance_m": 1600}}]
    by = share.shares_by_venue(opts, walks)
    assert by["near"] == [0.67, 0.33]
    assert by["far"] == [1.0, 0.0]                    # 너무 먼 역은 그 공연장 기준 0


def test_similar_only_when_same_level_and_close():
    assert share.similar([opt(100), opt(105)]) is True
    assert share.similar([opt(100), opt(130)]) is False
    assert share.similar([opt(140), opt(160)]) is False   # 보통 vs 혼잡
    assert share.similar([opt(100)]) is False


def test_compare_file_carries_share_fields():
    day = {"olympic_park": {h: s(400 if h == 20 else 100) for h in range(19, 24)},
           "bangi": {h: s(100) for h in range(19, 24)}}
    walk = {("kspo_dome", "olympic_park"): {"walk_min": 12, "distance_m": 783},
            ("kspo_dome", "bangi"): {"walk_min": 27, "distance_m": 1639}}
    c = compare.compare(day, 20, walk)
    assert sum(o["share"] for o in c["options"]) == pytest.approx(1)
    assert c["similar"] is True                       # 방이역 20시대와 올림픽공원역 21시대가 둘 다 보통 1.0배
    by_id = {o["id"]: o for o in c["options"]}
    assert by_id["walk_bangi"]["share_by_venue"]["kspo_dome"] == 0.0     # 27분 → 제외
    assert by_id["walk_bangi"]["share"] > 0                              # 공연장을 모를 때는 포함
    assert errors_of("compare-olympic_park-2099-01-10-20.json",
                     {"schema_version": "1.0", "updated_at": "2099-01-01T00:00:00+09:00", "data": c}) == []
