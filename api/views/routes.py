from __future__ import annotations

import logging
from typing import Any, Dict

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import RoundTripRouteQuerySerializer
from api.services.graphhopper import (
    GraphHopperClientError,
    RoundTripOptions,
    request_round_trip_route,
)

logger = logging.getLogger(__name__)


class RoundTripRouteView(APIView):
    """Return a round-trip route from GraphHopper around the provided lat/lon."""

    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        query_serializer = RoundTripRouteQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        params = query_serializer.validated_data

        options = RoundTripOptions(
            lat=params['lat'],
            lon=params['lon'],
            minutes=params['minutes'],
            points_encoded=params['points_encoded'],
        )

        try:
            payload: Dict[str, Any] = request_round_trip_route(options)
        except GraphHopperClientError as exc:
            logger.warning('GraphHopper upstream error: %s', exc)
            status_code = exc.status_code or status.HTTP_502_BAD_GATEWAY
            return Response({'error': 'GRAPHOPPER_UPSTREAM_ERROR', 'detail': str(exc)}, status=status_code)

        paths = payload.get('paths')
        if not isinstance(paths, list) or not paths:
            return Response({'error': 'Invalid GraphHopper response: missing paths'}, status=status.HTTP_502_BAD_GATEWAY)

        primary_path = paths[0] if isinstance(paths[0], dict) else None
        if not primary_path:
            return Response({'error': 'Invalid GraphHopper response: missing path data'}, status=status.HTTP_502_BAD_GATEWAY)

        points = primary_path.get('points')
        if not points:
            return Response({'error': 'Invalid GraphHopper response: missing points'}, status=status.HTTP_502_BAD_GATEWAY)

        if not params['points_encoded']:
            if isinstance(points, str):
                return Response({'error': 'Invalid GraphHopper response: expected coordinates but got encoded string'}, status=status.HTTP_502_BAD_GATEWAY)
            coordinates = points.get('coordinates') if isinstance(points, dict) else None
            if not isinstance(coordinates, list):
                return Response({'error': 'Invalid GraphHopper response: missing coordinates'}, status=status.HTTP_502_BAD_GATEWAY)
            route_summary = {
                'coordinates': coordinates,
                'distance_meters': primary_path.get('distance'),
                'duration_ms': primary_path.get('time'),
                'bbox': primary_path.get('bbox'),
                'ascend': primary_path.get('ascend'),
                'descend': primary_path.get('descend'),
            }
            return Response(route_summary, status=status.HTTP_200_OK)

        return Response(
            {
                'points': points,
                'distance_meters': primary_path.get('distance'),
                'duration_ms': primary_path.get('time'),
                'bbox': primary_path.get('bbox'),
                'ascend': primary_path.get('ascend'),
                'descend': primary_path.get('descend'),
            },
            status=status.HTTP_200_OK,
        )
