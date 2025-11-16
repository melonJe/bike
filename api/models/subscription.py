from __future__ import annotations

from django.db import models

from .base import TimeStampedModel
from .user import ExternalUser


class Subscription(TimeStampedModel):
    """Readonly representation of subscription table."""

    class Tier(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        MAX = "max", "Max"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    user = models.ForeignKey(
        ExternalUser,
        db_column="user_id",
        related_name="subscriptions",
        on_delete=models.CASCADE,
    )
    tier = models.CharField(max_length=16, choices=Tier.choices)
    status = models.CharField(max_length=16, choices=Status.choices)
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    cancel_at_period_end = models.BooleanField(default=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "subscription"
        managed = False
        ordering = ("-current_period_end",)

    def __str__(self) -> str:  # pragma: no cover - human readable
        return f"{self.user_id} - {self.tier} ({self.status})"
