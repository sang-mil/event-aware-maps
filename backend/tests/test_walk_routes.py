from maps import walk_routes


def test_place_search_requires_matching_name(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"documents": [
        {"place_name": "올림픽공원역", "x": "127.12", "y": "37.51"},
        {"place_name": "올림픽공원", "x": "127.13", "y": "37.52"},
    ]})
    assert walk_routes.find_place("올림픽공원역", "not-a-real-key") == {
        "name": "올림픽공원역", "x": 127.12, "y": 37.51
    }


def test_route_extracts_path_duration_and_distance(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {
        "status": "OK",
        "route": {
            "properties": {"totalDistance": 501, "totalTime": 601, "landingUrl": "https://map.kakao.com/route"},
            "legs": [{"steps": [
                {"path": {"points": [[127.1, 37.5], [127.2, 37.6]]}},
                {"path": {"points": [[127.2, 37.6], [127.3, 37.7]]}},
            ]}],
        },
    })
    route = walk_routes.walking_route({"x": 127.1, "y": 37.5, "name": "A"}, {"x": 127.3, "y": 37.7, "name": "B"}, "unused")
    assert route == {
        "distance_m": 501,
        "walk_min": 10,
        "path": [[127.1, 37.5], [127.2, 37.6], [127.3, 37.7]],
        "landing_url": "https://map.kakao.com/route",
    }


def test_unavailable_route_is_explicitly_missing(monkeypatch):
    monkeypatch.setattr(walk_routes, "_request", lambda *_: {"status": "ROUTE_RESULT_NOT_FOUND"})
    assert walk_routes.walking_route({"x": 127, "y": 37, "name": "A"}, {"x": 128, "y": 38, "name": "B"}, "unused") is None
