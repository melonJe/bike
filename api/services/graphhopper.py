from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

DEFAULT_TIMEOUT_SECONDS = 15


class GraphHopperClientError(Exception):
    """Raised when GraphHopper returns an error or cannot be reached."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _build_url(path: str) -> str:
    base = settings.GRAPHHOPPER['BASE_URL'].rstrip('/')
    normalized = path.lstrip('/')
    return f"{base}/{normalized}"


def _request_json(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    query = urlencode(params, doseq=True)
    url = _build_url(path)
    if query:
        url = f"{url}?{query}"

    request = Request(url, headers={'Accept': 'application/json'})
    timeout = settings.GRAPHHOPPER.get('REQUEST_TIMEOUT_SECONDS', DEFAULT_TIMEOUT_SECONDS)

    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 (graphhopper internal network)
            payload = response.read().decode('utf-8')
    except HTTPError as exc:  # pragma: no cover - passthrough for clarity
        body = exc.read().decode('utf-8', errors='replace')
        raise GraphHopperClientError(body or 'GraphHopper upstream error', status_code=exc.code) from exc
    except URLError as exc:  # pragma: no cover - network failure branch
        raise GraphHopperClientError('GraphHopper service unreachable') from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:  # pragma: no cover - unexpected upstream body
        raise GraphHopperClientError('Invalid JSON payload from GraphHopper') from exc


@dataclass(frozen=True)
class RoundTripOptions:
    lat: float
    lon: float
    minutes: int
    points_encoded: bool = False


def _bike_speed_meters_per_minute() -> float:
    kmh = settings.GRAPHHOPPER.get('AVERAGE_SPEED_KMH', 15.0)
    try:
        speed_val = float(kmh)
    except (TypeError, ValueError):
        speed_val = 15.0
    return max(0.1, (speed_val * 1000.0) / 60.0)


def request_round_trip_route(options: RoundTripOptions) -> Dict[str, Any]:
    distance_meters = max(1, round(options.minutes * _bike_speed_meters_per_minute()))
    params: Dict[str, Any] = {
        'point': f"{options.lat},{options.lon}",
        'profile': settings.GRAPHHOPPER.get('PROFILE', 'bike'),
        'algorithm': settings.GRAPHHOPPER.get('ALGORITHM', 'round_trip'),
        'ch.disable': str(settings.GRAPHHOPPER.get('CH_DISABLE', 'true')).lower(),
        'round_trip.distance': distance_meters,
        'points_encoded': str(bool(options.points_encoded)).lower(),
    }

    payload = _request_json('/route', params)
    return payload
