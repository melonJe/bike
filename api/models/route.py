from __future__ import annotations

from django.db import models

from .base import TimeStampedModel
from .user import ExternalUser


class Route(TimeStampedModel):
    """Existing public.route records."""

    id = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(
        ExternalUser,
        db_column="user_id",
        on_delete=models.CASCADE,
        related_name="routes",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    coordinates = models.JSONField()
    distance_km = models.FloatField()
    duration_minutes = models.PositiveIntegerField()
    elevation_gain_m = models.IntegerField(null=True, blank=True)
    elevation_profile = models.JSONField(null=True, blank=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "route"
        managed = False
        ordering = ("-created_at",)

    def __str__(self) -> str:  # pragma: no cover - human readable
        return self.title
