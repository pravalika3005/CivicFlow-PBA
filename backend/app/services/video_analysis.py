"""Real video analysis using OpenCV (no fabricated detections).

What this pipeline genuinely measures
-------------------------------------
1. Video metadata: duration, frame rate, resolution, frame count.
2. Motion activity: sampled frames are compared with the previous sampled
   frame (grayscale, blurred, absolute difference). The percentage of pixels
   that changed is the "motion level". Runs of high motion become "motion
   events" with start/end times.
3. People presence: OpenCV's built-in HOG + linear-SVM pedestrian detector is
   run on evenly spaced frames. This is a classical detector: it can miss
   people and can give false alarms, so counts are reported as "detected",
   never as exact headcounts.

What it does NOT do
-------------------
It does not recognise specific behaviours (fights, accidents, theft, etc.),
identify individuals, or read number plates. That requires a trained
deep-learning model, which is not bundled. The result says so explicitly.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

MAX_MOTION_SAMPLES = 600       # upper limit of frames compared for motion
TARGET_SAMPLES_PER_SECOND = 4  # how many frames per second are compared
MOTION_PIXEL_THRESHOLD = 25    # grey-level change that counts as "changed"
MOTION_EVENT_THRESHOLD_PCT = 2.0
MAX_PEOPLE_FRAMES = 24
TIMELINE_POINTS = 120

LIMITATIONS = [
    "Motion level measures how many pixels changed between sampled frames. "
    "Camera shake, lighting changes or weather also create motion.",
    "People detection uses OpenCV's classical HOG pedestrian detector. It can "
    "miss people (small, partly hidden, unusual poses) and can raise false alarms.",
    "No behaviour classification (fights, accidents, theft, etc.) is performed: "
    "that needs a trained deep-learning model, which is not installed.",
]

ProgressCallback = Callable[[int], None]


class VideoAnalysisError(Exception):
    """The video could not be opened or contained no readable frames."""


def check_video_readable(path: Path) -> None:
    """Quick check used at upload time: can OpenCV open it and read a frame?"""
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise VideoAnalysisError("The file could not be opened as a video.")
        ok, frame = capture.read()
        if not ok or frame is None:
            raise VideoAnalysisError("The file does not contain any readable video frames.")
    finally:
        capture.release()


def _prepare_gray(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    scale = 320.0 / width if width > 320 else 1.0
    if scale != 1.0:
        frame = cv2.resize(frame, (320, max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.GaussianBlur(gray, (5, 5), 0)


def _make_people_detector():
    """Return an OpenCV HOG pedestrian detector, or ``(None, reason)``."""
    try:
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor.getDefaultPeopleDetector())  # type: ignore[arg-type,call-overload]  # stubs are inaccurate
        return hog, None
    except Exception as exc:  # noqa: BLE001 - depends on the OpenCV build
        return None, f"HOG people detector is not available in this OpenCV build ({exc})."


def _detect_people(hog, frame: np.ndarray) -> int:
    height, width = frame.shape[:2]
    scale = 640.0 / width if width > 640 else 1.0
    if scale != 1.0:
        frame = cv2.resize(frame, (640, max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    rects, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
    if len(rects) == 0:
        return 0
    return int(sum(1 for w in np.asarray(weights).ravel() if float(w) >= 0.5))


def _activity_level(mean_pct: float) -> str:
    if mean_pct < 1.0:
        return "low"
    if mean_pct < 5.0:
        return "moderate"
    return "high"


def _downsample(points: list[dict], limit: int) -> list[dict]:
    if len(points) <= limit:
        return points
    step = len(points) / limit
    return [points[int(i * step)] for i in range(limit)]


def _build_events(samples: list[tuple[float, float]]) -> list[dict]:
    events: list[dict] = []
    current: dict | None = None
    for t, pct in samples:
        if pct >= MOTION_EVENT_THRESHOLD_PCT:
            if current is None:
                current = {"start_s": t, "end_s": t, "peak_pct": pct}
            else:
                current["end_s"] = t
                current["peak_pct"] = max(current["peak_pct"], pct)
        elif current is not None:
            events.append(current)
            current = None
    if current is not None:
        events.append(current)
    return [
        {"start_s": round(e["start_s"], 2), "end_s": round(e["end_s"], 2), "peak_pct": round(e["peak_pct"], 2)}
        for e in events
    ]


def _summary(meta: dict, motion: dict, people: dict) -> str:
    parts = [
        f"Analysed a {meta['duration_s']:.1f}-second video ({meta['width']}x{meta['height']}, "
        f"{meta['fps']:.1f} fps)."
    ]
    n_events = len(motion["events"])
    parts.append(
        f"Motion activity is {motion['activity_level']} (average {motion['mean_pct']:.2f}% of pixels changing)"
        + (f", with {n_events} distinct motion event{'s' if n_events != 1 else ''}." if n_events else ", with no distinct motion events.")
    )
    if people["available"]:
        if people["frames_with_people"]:
            parts.append(
                f"The pedestrian detector found people in {people['frames_with_people']} of "
                f"{people['frames_checked']} checked frames (up to {people['max_in_frame']} at once)."
            )
        else:
            parts.append(
                f"The pedestrian detector found no people in the {people['frames_checked']} frames it checked."
            )
    else:
        parts.append("People detection was unavailable.")
    return " ".join(parts)


def analyze_video(path: Path, on_progress: ProgressCallback | None = None) -> dict:
    """Analyse a video file and return a JSON-serialisable result."""
    progress = on_progress or (lambda _p: None)
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise VideoAnalysisError("The file could not be opened as a video.")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if not math.isfinite(fps) or fps <= 0 or fps > 240:
            fps = 25.0  # container did not report a usable rate; documented in the result
            fps_assumed = True
        else:
            fps_assumed = False
        reported_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        step = max(1, round(fps / TARGET_SAMPLES_PER_SECOND))
        if reported_frames > 0:
            step = max(step, math.ceil(reported_frames / MAX_MOTION_SAMPLES))

        hog, people_reason = _make_people_detector()
        # Run the (slower) people detector on every Nth *sampled* frame so that at most
        # MAX_PEOPLE_FRAMES frames are checked, spread evenly across the video.
        expected_samples = reported_frames // step if reported_frames > 0 else 0
        people_every = max(1, math.ceil(expected_samples / MAX_PEOPLE_FRAMES)) if expected_samples else 10

        previous_gray: np.ndarray | None = None
        motion_samples: list[tuple[float, float]] = []
        people_counts: list[int] = []
        frame_index = 0
        sample_index = 0

        while True:
            if not capture.grab():
                break
            if frame_index % step == 0:
                ok, frame = capture.retrieve()
                if ok and frame is not None:
                    gray = _prepare_gray(frame)
                    if previous_gray is not None and previous_gray.shape == gray.shape:
                        diff = cv2.absdiff(previous_gray, gray)
                        changed = float(np.count_nonzero(diff > MOTION_PIXEL_THRESHOLD))
                        pct = 100.0 * changed / diff.size
                        motion_samples.append((frame_index / fps, pct))
                    previous_gray = gray

                    if (
                        hog is not None
                        and len(people_counts) < MAX_PEOPLE_FRAMES
                        and sample_index % people_every == 0
                    ):
                        people_counts.append(_detect_people(hog, frame))
                    sample_index += 1
            frame_index += 1
            if reported_frames > 0 and frame_index % 25 == 0:
                progress(int(95 * frame_index / reported_frames))
    finally:
        capture.release()

    total_frames = frame_index
    if previous_gray is None:
        raise VideoAnalysisError("The video did not contain any readable frames.")

    duration = total_frames / fps if total_frames else 0.0
    metadata = {
        "duration_s": round(duration, 2),
        "fps": round(fps, 2),
        "fps_assumed": fps_assumed,
        "width": width,
        "height": height,
        "frame_count": total_frames,
        "frames_sampled": len(motion_samples) + 1,
    }

    values = [pct for _, pct in motion_samples]
    mean_pct = float(np.mean(values)) if values else 0.0
    motion = {
        "available": True,
        "mean_pct": round(mean_pct, 3),
        "peak_pct": round(float(max(values)), 3) if values else 0.0,
        "activity_level": _activity_level(mean_pct),
        "event_threshold_pct": MOTION_EVENT_THRESHOLD_PCT,
        "events": _build_events(motion_samples),
        "timeline": _downsample(
            [{"t": round(t, 2), "motion_pct": round(p, 3)} for t, p in motion_samples], TIMELINE_POINTS
        ),
    }

    if hog is None:
        people = {"available": False, "reason": people_reason}
    else:
        people = {
            "available": True,
            "method": "OpenCV HOG pedestrian detector (classical, approximate)",
            "frames_checked": len(people_counts),
            "frames_with_people": sum(1 for c in people_counts if c > 0),
            "max_in_frame": max(people_counts) if people_counts else 0,
        }

    progress(99)
    return {
        "metadata": metadata,
        "motion": motion,
        "people": people,
        "behavior_classification": {
            "available": False,
            "reason": "No trained behaviour-recognition model is installed, so behaviours "
                      "(e.g. fights, accidents) are not classified.",
        },
        "summary": _summary(metadata, motion, people),
        "limitations": LIMITATIONS,
    }
