from __future__ import annotations

from django.conf import settings
from django.views.generic import TemplateView

from api.models import FavoriteRoute
from api.serializers import FavoriteRouteSerializer


class FrontpageView(TemplateView):
    template_name = 'index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        favorites = FavoriteRoute.objects.order_by('-created_at')[:10]
        context['mapbox'] = settings.MAPBOX
        context['favorites'] = favorites
        context['favorites_json'] = FavoriteRouteSerializer(favorites, many=True).data
        return context
