from __future__ import annotations

import logging
from typing import Any, Dict

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .services.graphhopper import (
    GraphHopperClientError,
    RoundTripOptions,
    request_round_trip_route,
)

logger = logging.getLogger(__name__)


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    return normalized in {'1', 'true', 'yes', 'on'}


@require_GET
def round_trip_route(request):
    """Return a round-trip route from GraphHopper around the provided lat/lon."""

    try:
        minutes_raw = request.GET.get('minutes', '30')
        minutes = int(float(minutes_raw))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Invalid minutes parameter'}, status=400)

    lat_raw = request.GET.get('lat')
    lon_raw = request.GET.get('lon')
    if lat_raw is None or lon_raw is None:
        return JsonResponse({'error': 'Missing required query parameters: lat, lon'}, status=400)

    try:
        lat = float(lat_raw)
        lon = float(lon_raw)
    except ValueError:
        return JsonResponse({'error': 'Invalid lat/lon parameters'}, status=400)

    if minutes <= 0:
        return JsonResponse({'error': 'Invalid minutes parameter'}, status=400)

    points_encoded = _parse_bool(request.GET.get('points_encoded'), default=False)

    options = RoundTripOptions(lat=lat, lon=lon, minutes=minutes, points_encoded=points_encoded)

    try:
        payload: Dict[str, Any] = request_round_trip_route(options)
    except GraphHopperClientError as exc:
        logger.warning('GraphHopper upstream error: %s', exc)
        status = exc.status_code or 502
        return JsonResponse({'error': 'GRAPHOPPER_UPSTREAM_ERROR', 'detail': str(exc)}, status=status)

    paths = payload.get('paths')
    if not isinstance(paths, list) or not paths:
        return JsonResponse({'error': 'Invalid GraphHopper response: missing paths'}, status=502)

    points = paths[0].get('points') if isinstance(paths[0], dict) else None
    if not points:
        return JsonResponse({'error': 'Invalid GraphHopper response: missing points'}, status=502)

    if not points_encoded:
        if isinstance(points, str):
            return JsonResponse({'error': 'Invalid GraphHopper response: expected coordinates but got encoded string'}, status=502)
        coordinates = points.get('coordinates') if isinstance(points, dict) else None
        if not isinstance(coordinates, list):
            return JsonResponse({'error': 'Invalid GraphHopper response: missing coordinates'}, status=502)
        return JsonResponse(coordinates, safe=False)

    return JsonResponse(points, safe=False)
