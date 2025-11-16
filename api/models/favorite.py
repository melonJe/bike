from __future__ import annotations

from django.db import models

from .base import TimeStampedModel


class FavoriteRoute(TimeStampedModel):
    """Routes saved by riders from loop/directions planners."""

    LOOP = "loop"
    DIRECTIONS = "directions"
    ROUTE_TYPE_CHOICES = ((LOOP, "Loop"), (DIRECTIONS, "Directions"))

    name = models.CharField(max_length=160)
    route_type = models.CharField(max_length=16, choices=ROUTE_TYPE_CHOICES)
    start_point = models.CharField(max_length=160, blank=True)
    end_point = models.CharField(max_length=160, blank=True)
    distance_km = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "favorite_route"
        ordering = ("-created_at",)

    def __str__(self) -> str:  # pragma: no cover - human readable
        return f"{self.name} ({self.route_type})"
