"""Build the lightweight world view from the bundled country region files."""

import json
from pathlib import Path


ROOT = Path(__file__).parent
DATA = ROOT / "public" / "data"
TOLERANCE = 0.12


def simplify(points, tolerance=TOLERANCE):
    if len(points) < 5:
        return points
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    denominator = dx * dx + dy * dy
    best, index = -1, 0
    for position, point in enumerate(points[1:-1], 1):
        amount = max(
            0,
            min(
                1,
                ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy)
                / denominator,
            ),
        ) if denominator else 0
        distance = (
            point[0] - start[0] - amount * dx
        ) ** 2 + (point[1] - start[1] - amount * dy) ** 2
        if distance > best:
            best, index = distance, position
    if best > tolerance * tolerance:
        return simplify(points[: index + 1], tolerance)[:-1] + simplify(
            points[index:], tolerance
        )
    return [start, end]


def ring(points):
    result = simplify(points)
    signed = lambda values: sum(
        values[index][0] * values[(index + 1) % len(values)][1]
        - values[(index + 1) % len(values)][0] * values[index][1]
        for index in range(len(values))
    )
    if len(result) < 8 or signed(result) * signed(points) <= 0:
        # Keeping the original tiny or inverted ring preserves winding.
        # An inverted island is interpreted by D3 as the rest of the globe.
        result = points
    elif result[0] != result[-1]:
        result.append(result[0])
    return result


def build():
    countries = json.loads((DATA / "countries.json").read_text())
    features = []
    for country in countries:
        source = json.loads((DATA / f"{country['code']}.json").read_text())
        polygons = []
        for feature in source["features"]:
            geometry = feature["geometry"]
            items = (
                [geometry["coordinates"]]
                if geometry["type"] == "Polygon"
                else geometry["coordinates"]
            )
            for polygon in items:
                rings = [ring(points) for points in polygon if len(points) >= 4]
                if rings:
                    polygons.append(rings)
        if polygons:
            features.append(
                {
                    "type": "Feature",
                    "properties": country,
                    "geometry": {"type": "MultiPolygon", "coordinates": polygons},
                }
            )
    output = {"type": "FeatureCollection", "features": features}
    (DATA / "world.json").write_text(json.dumps(output, separators=(",", ":")))
    print(f"Built world.json with {len(features)} countries")


if __name__ == "__main__":
    build()
