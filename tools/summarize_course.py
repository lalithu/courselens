"""Generate course aggregates from a prepared trace directory."""
import argparse
from bisect import bisect_right
from collections import Counter, defaultdict
import json
from statistics import median
from pathlib import Path


def mastery(snapshot):
    states = [item["mastered"] for item in snapshot["concepts"]]
    if not states or None in states:
        return None
    return sum(states) * 100 / len(states)


def summarize(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    daily = defaultdict(list)
    final = []
    activity = Counter()
    snapshots = 0
    event_days = []
    snapshot_days_all = []
    activity_days = defaultdict(list)
    for entry in manifest["traces"]:
        trace = json.loads((directory / entry["path"]).read_text())
        history = trace["snapshots"]
        snapshots += len(history)
        activity.update(event["type"] for event in trace["events"])
        snapshot_days = {snapshot["id"]: snapshot["day"] for snapshot in history}
        snapshot_days_all.extend(snapshot_days.values())
        for event in trace["events"]:
            day = snapshot_days[event["snapshotId"]]
            event_days.append(day)
            activity_days[event["type"]].append(day)
        last = mastery(history[-1])
        if last is not None:
            final.append(last)
        cursor = 0
        for day in range(int(history[0]["day"]), int(history[-1]["day"]) + 1):
            if day < history[0]["day"]:
                continue
            while cursor + 1 < len(history) and history[cursor + 1]["day"] <= day:
                cursor += 1
            value = mastery(history[cursor])
            if value is not None:
                daily[day].append(value)
    event_days.sort()
    snapshot_days_all.sort()
    for values in activity_days.values():
        values.sort()
    return {
        "lastDay": max(snapshot_days_all, default=0),
        "traceCount": len(manifest["traces"]),
        "snapshotCount": snapshots,
        "eventCount": sum(activity.values()),
        "activity": dict(activity),
        "finalMean": sum(final) / len(final) if final else None,
        "finalCount": len(final),
        "trend": [
            {"day": day, "mean": sum(values) / len(values), "count": len(values),
             "median": median(values), "eventsThroughDay": bisect_right(event_days, day),
             "snapshotsThroughDay": bisect_right(snapshot_days_all, day),
             "activityThroughDay": {kind: bisect_right(recorded, day) for kind, recorded in activity_days.items()}}
            for day, values in sorted(daily.items())
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory
    (directory / "course-summary.json").write_text(json.dumps(summarize(directory), indent=2) + "\n")
