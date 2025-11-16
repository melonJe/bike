from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from api.models import FavoriteRoute
from api.serializers import FavoriteRouteSerializer


class FavoriteRouteViewSet(viewsets.ModelViewSet):
    """CRUD operations for favorite routes."""

    queryset = FavoriteRoute.objects.all().order_by('-created_at')
    serializer_class = FavoriteRouteSerializer
    permission_classes = [AllowAny]
