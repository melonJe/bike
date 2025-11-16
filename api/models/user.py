from __future__ import annotations

from django.db import models


class ExternalUser(models.Model):
    """Readonly representation of the existing user table."""

    class AuthProvider(models.TextChoices):
        GOOGLE = "google", "Google"

    class Role(models.TextChoices):
        USER = "user", "User"
        ADMIN = "admin", "Admin"

    id = models.CharField(primary_key=True, max_length=64)
    name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(unique=True)
    email_verified = models.DateTimeField(null=True, blank=True)
    image = models.URLField(blank=True)
    provider = models.CharField(max_length=32, choices=AuthProvider.choices, default=AuthProvider.GOOGLE)
    provider_account_id = models.CharField(max_length=128)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "user"
        managed = False
        ordering = ("-created_at",)

    def __str__(self) -> str:  # pragma: no cover - human readable
        return self.email
