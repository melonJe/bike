from __future__ import annotations

from rest_framework import serializers

from .models import FavoriteRoute


class RoundTripRouteQuerySerializer(serializers.Serializer):
    lat = serializers.FloatField(required=True)
    lon = serializers.FloatField(required=True)
    minutes = serializers.IntegerField(min_value=1, default=30)
    points_encoded = serializers.BooleanField(required=False, default=False)


class FavoriteRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = FavoriteRoute
        fields = (
            "id",
            "name",
            "route_type",
            "start_point",
            "end_point",
            "distance_km",
            "duration_minutes",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
