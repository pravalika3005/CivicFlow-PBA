"""Shared fixed-choice values and their human-readable labels."""
from enum import Enum


class Category(str, Enum):
    road_damage = "road_damage"
    water_supply = "water_supply"
    sanitation_waste = "sanitation_waste"
    streetlight = "streetlight"
    drainage_flooding = "drainage_flooding"
    electricity = "electricity"
    traffic_signal = "traffic_signal"
    public_safety = "public_safety"
    parks_public_space = "parks_public_space"
    noise_pollution = "noise_pollution"
    other = "other"


class LocationType(str, Enum):
    main_road = "main_road"
    public_space = "public_space"
    commercial = "commercial"
    industrial = "industrial"
    residential = "residential"
    rural = "rural"
    other = "other"


class TrafficLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ComplaintStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    resolved = "resolved"


class PriorityLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class VideoStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


CATEGORY_LABELS = {
    "road_damage": "Road damage / potholes",
    "water_supply": "Water supply",
    "sanitation_waste": "Sanitation & waste",
    "streetlight": "Streetlight",
    "drainage_flooding": "Drainage & flooding",
    "electricity": "Electricity",
    "traffic_signal": "Traffic signal",
    "public_safety": "Public safety",
    "parks_public_space": "Parks & public spaces",
    "noise_pollution": "Noise & pollution",
    "other": "Other",
}

LOCATION_TYPE_LABELS = {
    "main_road": "Main road / highway",
    "public_space": "Public space / market",
    "commercial": "Commercial area",
    "industrial": "Industrial area",
    "residential": "Residential area",
    "rural": "Rural / outskirts",
    "other": "Other / unknown",
}

TRAFFIC_LABELS = {"low": "Low", "medium": "Medium", "high": "High"}
STATUS_LABELS = {"pending": "Pending", "in_progress": "In progress", "resolved": "Resolved"}
PRIORITY_LABELS = {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"}
SEVERITY_LABELS = {1: "Minor", 2: "Low", 3: "Moderate", 4: "Serious", 5: "Severe"}
