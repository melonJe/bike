'use strict';

const MODES = ['circular', 'directions', 'popularity', 'favorites', 'history'];
const API_ENDPOINTS = {
  roundTrip: '/api/paths/route/',
  favorites: '/api/favorites/',
};
const ROUTE_SOURCE_ID = 'generated-route';
let mapInstance = null;
let latestLoopRoute = null;
let routeDetailPanel = null;
let routeDetailFields = {};
let routeDetailSaveButton = null;
let favoriteCache = [];

const defaultRouteDetailContent = {
  name: '루프 경로',
  distance: '-- km',
  duration: '-- 분',
  ascend: '-- m',
  descend: '-- m',
  meta: '경로를 생성하면 상세 정보가 표시됩니다.',
};

const getCsrfToken = () => {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const applyRouteDetailContent = (content = {}) => {
  Object.entries(routeDetailFields).forEach(([key, node]) => {
    if (!node) {
      return;
    }
    const fallback = defaultRouteDetailContent[key] ?? '';
    node.textContent = content[key] ?? fallback;
  });
};

const resetRouteDetailContent = () => {
  applyRouteDetailContent();
};

const toggleRouteDetailPanel = isVisible => {
  if (!routeDetailPanel) {
    return;
  }
  routeDetailPanel.hidden = !isVisible;
};

const initRouteDetailPanel = () => {
  routeDetailPanel = document.querySelector('[data-route-detail-panel]');
  if (!routeDetailPanel) {
    return;
  }
  routeDetailFields = {
    name: routeDetailPanel.querySelector('[data-route-detail-field="name"]'),
    distance: routeDetailPanel.querySelector('[data-route-detail-field="distance"]'),
    duration: routeDetailPanel.querySelector('[data-route-detail-field="duration"]'),
    ascend: routeDetailPanel.querySelector('[data-route-detail-field="ascend"]'),
    descend: routeDetailPanel.querySelector('[data-route-detail-field="descend"]'),
    meta: routeDetailPanel.querySelector('[data-route-detail-field="meta"]'),
  };
  routeDetailSaveButton = routeDetailPanel.querySelector('[data-action="save-loop-favorite"]');
  const closeButton = routeDetailPanel.querySelector('[data-action="close-route-detail"]');
  closeButton?.addEventListener('click', () => {
    toggleRouteDetailPanel(false);
    resetRouteDetailContent();
    setSaveButtonState(routeDetailSaveButton, false);
    latestLoopRoute = null;
  });
  toggleRouteDetailPanel(false);
  resetRouteDetailContent();
};

const updateRouteDetailPanelContent = summary => {
  applyRouteDetailContent(summary);
  toggleRouteDetailPanel(true);
};

const formatDistanceKm = meters => {
  if (typeof meters !== 'number' || Number.isNaN(meters)) {
    return '-- km';
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

const formatDurationMinutes = minutes => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return '-- 분';
  }
  return `${minutes} 분`;
};

const formatElevation = value => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-- m';
  }
  return `${Math.round(value)} m`;
};

const activateMode = mode => {
  const buttons = document.querySelectorAll('.side-button');
  const panels = document.querySelectorAll('.sidebar-panel');

  buttons.forEach(button => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.mode === mode);
  });
};

const initSidebarInteractions = () => {
  const buttonContainer = document.querySelector('.side-button-bar__buttons');
  buttonContainer?.addEventListener('click', event => {
    const target = event.target.closest('.side-button');
    if (!target || target.getAttribute('aria-disabled') === 'true') {
      return;
    }
    event.preventDefault();
    activateMode(target.dataset.mode || 'circular');
  });

  const loginButton = document.querySelector('.primary-action');
  loginButton?.addEventListener('click', () => {
    loginButton.classList.toggle('is-outline');
    loginButton.textContent = loginButton.classList.contains('is-outline') ? '게스트로 계속' : '로그인';
  });

  const optionButtons = document.querySelectorAll('.option-button');
  optionButtons.forEach(button => {
    button.addEventListener('click', () => {
      optionButtons.forEach(btn => btn.classList.remove('is-active'));
      button.classList.add('is-active');
    });
  });

  const historyItems = document.querySelectorAll('.history-item');
  historyItems.forEach(item => {
    item.addEventListener('click', () => {
      historyItems.forEach(btn => btn.classList.remove('is-active'));
      item.classList.add('is-active');
    });
  });

  activateMode('circular');
};

const getFavoriteById = favoriteId =>
  favoriteCache.find(entry => entry.id === favoriteId || entry.id === String(favoriteId));

const renderFavoriteOnMap = favorite => {
  const coordinates = favorite?.metadata?.coordinates;
  if (!Array.isArray(coordinates) || !coordinates.length) {
    window.alert('저장된 경로에 좌표 정보가 없어 지도를 표시할 수 없습니다.');
    return;
  }
  drawRouteOnMap(coordinates);
  updateRouteDetailPanelContent({
    name: favorite.name,
    distance: favorite.distance_km ? `${Number(favorite.distance_km).toFixed(2)} km` : '-- km',
    duration: favorite.duration_minutes ? `${favorite.duration_minutes} 분` : '-- 분',
    ascend: favorite.metadata?.ascend ? `${Math.round(favorite.metadata.ascend)} m` : '-- m',
    descend: favorite.metadata?.descend ? `${Math.round(favorite.metadata.descend)} m` : '-- m',
    meta: favorite.metadata?.bbox ? '저장된 경로를 불러왔습니다.' : '저장된 경로 세부 정보를 확인하세요.',
  });
  setSaveButtonState(routeDetailSaveButton, false);
  latestLoopRoute = null;
};

const setFavoriteCache = entries => {
  favoriteCache = Array.isArray(entries) ? [...entries] : [];
};

const removeFavoriteFromCache = favoriteId => {
  setFavoriteCache(favoriteCache.filter(item => String(item.id) !== String(favoriteId)));
};

const updateFavoriteEmptyState = () => {
  const list = document.querySelector('[data-favorite-list]');
  const emptyElement = list?.querySelector('[data-favorite-empty]');
  const hasCards = !!list?.querySelector('.route-card');
  if (emptyElement) {
    emptyElement.hidden = hasCards;
  }
};

const deleteFavorite = async favoriteId => {
  const headers = { Accept: 'application/json' };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }
  const response = await fetch(`${API_ENDPOINTS.favorites}${favoriteId}/`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    throw new Error('즐겨찾기를 삭제할 수 없습니다. 다시 시도해 주세요.');
  }
};

const initFavoritePanelInteractions = () => {
  const favoriteList = document.querySelector('[data-favorite-list]');
  if (!favoriteList) {
    return;
  }

  favoriteList.addEventListener('click', event => {
    const link = event.target.closest('[data-action="open-favorite-detail"]');
    if (link) {
      event.preventDefault();
      const favoriteId = link.dataset.favoriteId;
      const favorite = getFavoriteById(favoriteId);
      if (!favorite) {
        window.alert('즐겨찾기 데이터를 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
        return;
      }
      renderFavoriteOnMap(favorite);
      return;
    }

    const deleteButton = event.target.closest('[data-action="delete-favorite"]');
    if (deleteButton) {
      event.preventDefault();
      const favoriteId = deleteButton.dataset.favoriteId;
      if (!favoriteId) {
        return;
      }
      if (!window.confirm('이 즐겨찾기 경로를 삭제할까요?')) {
        return;
      }
      deleteButton.disabled = true;
      deleteButton.textContent = '삭제 중...';
      deleteFavorite(favoriteId)
        .then(() => {
          removeFavoriteFromCache(favoriteId);
          const card = deleteButton.closest('.route-card');
          card?.remove();
          updateFavoriteEmptyState();
          if (routeDetailPanel && !routeDetailPanel.hidden) {
            const detailName = routeDetailFields?.name?.textContent;
            const favorite = getFavoriteById(favoriteId);
            if (!favorite && detailName && detailName.trim() === deleteButton.dataset.favoriteName) {
              toggleRouteDetailPanel(false);
              resetRouteDetailContent();
            }
          }
        })
        .catch(error => {
          console.error(error);
          window.alert(error.message || '즐겨찾기 삭제 중 오류가 발생했습니다.');
        })
        .finally(() => {
          deleteButton.textContent = '삭제';
          deleteButton.disabled = false;
        });
    }
  });
};

const requestRoundTripRoute = async ({ lat, lon, minutes }) => {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    minutes: String(minutes),
    points_encoded: 'false',
  });
  const response = await fetch(`${API_ENDPOINTS.roundTrip}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = data?.detail || data?.error || '경로 생성에 실패했습니다.';
    throw new Error(message);
  }
  return data;
};

const fitMapToRoute = (map, coordinates) => {
  if (!map || !Array.isArray(coordinates) || !coordinates.length) {
    return;
  }
  const bounds = coordinates.reduce((acc, coord) => {
    if (!Array.isArray(coord) || coord.length < 2) {
      return acc;
    }
    const [lng, lat] = coord;
    if (!acc) {
      return new window.mapboxgl.LngLatBounds([lng, lat], [lng, lat]);
    }
    acc.extend([lng, lat]);
    return acc;
  }, null);
  if (bounds) {
    map.fitBounds(bounds, { padding: 48, duration: 800, maxZoom: 15 });
  }
};

const drawRouteOnMap = coordinates => {
  if (!mapInstance) {
    console.warn('지도 초기화가 완료되지 않았습니다.');
    return;
  }

  const render = () => {
    const data = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    };

    if (mapInstance.getSource(ROUTE_SOURCE_ID)) {
      mapInstance.getSource(ROUTE_SOURCE_ID).setData(data);
    } else {
      mapInstance.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
      mapInstance.addLayer({
        id: ROUTE_SOURCE_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2563eb',
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });
    }
    fitMapToRoute(mapInstance, coordinates);
  };

  if (!mapInstance.isStyleLoaded()) {
    mapInstance.once('load', render);
  } else {
    render();
  }
};

const setSaveButtonState = (button, isEnabled) => {
  if (!button) return;
  button.disabled = !isEnabled;
  button.setAttribute('aria-disabled', String(!isEnabled));
  const defaultLabel = button.dataset.defaultLabel || button.textContent || '즐겨찾기 저장';
  button.textContent = defaultLabel;
};

const saveFavoriteRoute = async payload => {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }
  const response = await fetch(API_ENDPOINTS.favorites, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.detail || data?.error || '즐겨찾기 저장에 실패했습니다.';
    throw new Error(message);
  }
  return data;
};

const initLoopRouteActions = config => {
  const panel = document.querySelector('.sidebar-panel[data-mode="circular"]');
  if (!panel) return;

  const generateButton = panel.querySelector('[data-action="generate-loop-route"]');
  const saveButton = routeDetailSaveButton;
  const startInput = panel.querySelector('input[name="loop-start"]');
  const durationInput = panel.querySelector('input[name="loop-duration"]');

  setSaveButtonState(saveButton, false);

  const handleGenerate = async () => {
    if (!durationInput) return;
    const minutes = Math.max(1, parseInt(durationInput.value, 10) || 30);
    const center = mapInstance?.getCenter();
    const lat = center?.lat ?? Number(config.CENTER_LAT);
    const lon = center?.lng ?? Number(config.CENTER_LNG);

    setSaveButtonState(saveButton, false);
    latestLoopRoute = null;
    resetRouteDetailContent();
    toggleRouteDetailPanel(false);

    if (generateButton) {
      generateButton.disabled = true;
      generateButton.textContent = '생성 중...';
    }

    try {
      const routeData = await requestRoundTripRoute({ lat, lon, minutes });
      if (!Array.isArray(routeData.coordinates) || !routeData.coordinates.length) {
        throw new Error('경로 좌표를 찾을 수 없습니다.');
      }

      drawRouteOnMap(routeData.coordinates);

      const startLabel = startInput?.value?.trim() || '루프 경로';
      const distanceKm =
        typeof routeData.distance_meters === 'number' ? Number((routeData.distance_meters / 1000).toFixed(2)) : null;
      const durationMinutes = routeData.duration_ms ? Math.max(1, Math.round(routeData.duration_ms / 60000)) : minutes;
      const ascendMeters = typeof routeData.ascend === 'number' ? routeData.ascend : null;
      const descendMeters = typeof routeData.descend === 'number' ? routeData.descend : null;

      latestLoopRoute = {
        name: startLabel,
        route_type: 'loop',
        start_point: startInput?.value || '',
        end_point: startInput?.value || '',
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        metadata: {
          bbox: routeData.bbox,
          ascend: routeData.ascend,
          descend: routeData.descend,
          coordinates: routeData.coordinates,
        },
      };

      updateRouteDetailPanelContent({
        name: startLabel,
        distance: formatDistanceKm(routeData.distance_meters),
        duration: formatDurationMinutes(durationMinutes),
        ascend: formatElevation(ascendMeters),
        descend: formatElevation(descendMeters),
        meta: `${distanceKm ?? '--'}km · 약 ${durationMinutes ?? '--'}분`,
      });
      setSaveButtonState(saveButton, true);
    } catch (error) {
      console.error(error);
      window.alert(error.message || '경로 생성에 실패했습니다.');
    } finally {
      if (generateButton) {
        generateButton.disabled = false;
        generateButton.textContent = '경로 생성하기';
      }
    }
  };

  const handleSaveFavorite = async () => {
    if (!latestLoopRoute) {
      window.alert('먼저 경로를 생성해 주세요.');
      return;
    }
    if (!saveButton) {
      return;
    }

    saveButton.disabled = true;
    saveButton.setAttribute('aria-disabled', 'true');
    saveButton.textContent = '저장 중...';

    try {
      await saveFavoriteRoute(latestLoopRoute);
      window.alert('즐겨찾기에 저장되었습니다.');
    } catch (error) {
      console.error(error);
      window.alert(error.message || '즐겨찾기 저장에 실패했습니다.');
    } finally {
      setSaveButtonState(saveButton, true);
    }
  };

  generateButton?.addEventListener('click', handleGenerate);
  saveButton?.addEventListener('click', handleSaveFavorite);
};

const initMapbox = config => {
  if (!config.ACCESS_TOKEN) {
    console.warn('Mapbox ACCESS_TOKEN이 설정되지 않았습니다. MAPBOX_ACCESS_TOKEN 환경변수를 확인하세요.');
    return;
  }

  if (!window.mapboxgl) {
    console.error('Mapbox GL JS를 불러오지 못했습니다.');
    return;
  }

  const container = document.getElementById('map');
  if (!container) {
    console.error('지도 컨테이너를 찾을 수 없습니다.');
    return;
  }

  if (container.dataset.initialized === 'true') {
    return;
  }

  container.replaceChildren();
  container.textContent = '';
  container.classList.remove('mapbox-unsupported');

  const isSupported =
    typeof window.mapboxgl.supported === 'function'
      ? window.mapboxgl.supported({ failIfMajorPerformanceCaveat: true })
      : true;

  if (!isSupported) {
    container.dataset.initialized = 'false';
    container.classList.add('mapbox-unsupported');
    container.textContent = '이 브라우저는 WebGL을 지원하지 않아 지도를 표시할 수 없습니다.';
    console.warn('Mapbox GL JS는 WebGL 지원이 필요합니다.');
    return;
  }

  container.dataset.initialized = 'true';

  window.mapboxgl.accessToken = config.ACCESS_TOKEN;

  const map = new window.mapboxgl.Map({
    container,
    style: config.STYLE_URL || 'mapbox://styles/mapbox/streets-v12',
    center: [config.CENTER_LNG, config.CENTER_LAT],
    zoom: config.ZOOM ?? 12,
  });

  map.on('load', () => {
    new window.mapboxgl.Marker({ color: '#2563eb' })
      .setLngLat([config.CENTER_LNG, config.CENTER_LAT])
      .addTo(map);

    map.addControl(new window.mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new window.mapboxgl.ScaleControl({ unit: 'metric' }));
  });

  mapInstance = map;
};

window.addEventListener('DOMContentLoaded', () => {
  initSidebarInteractions();

  const configElement = document.getElementById('mapbox-config');
  if (!configElement) {
    console.error('Mapbox 설정을 찾을 수 없습니다.');
    return;
  }

  let config;
  try {
    config = JSON.parse(configElement.textContent || '{}');
  } catch (error) {
    console.error('Mapbox 설정 파싱에 실패했습니다.', error);
    return;
  }

  const favoriteDataElement = document.getElementById('favorite-data');
  if (favoriteDataElement) {
    try {
      setFavoriteCache(JSON.parse(favoriteDataElement.textContent || '[]'));
    } catch (error) {
      console.error('즐겨찾기 데이터 파싱에 실패했습니다.', error);
    }
  }

  initRouteDetailPanel();
  initLoopRouteActions(config);
  initFavoritePanelInteractions();

  const initWhenReady = () => initMapbox(config);

  if (window.mapboxgl) {
    initWhenReady();
  } else {
    const mapboxScript = document.getElementById('mapbox-gl-js');
    if (mapboxScript) {
      mapboxScript.addEventListener('load', initWhenReady, { once: true });
      mapboxScript.addEventListener(
        'error',
        () => {
          console.error('Mapbox GL JS 로딩에 실패했습니다.');
        },
        { once: true },
      );
    } else {
      window.addEventListener(
        'load',
        () => {
          if (window.mapboxgl) {
            initWhenReady();
          } else {
            console.error('Mapbox GL JS를 불러오지 못했습니다.');
          }
        },
        { once: true },
      );
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker 등록 성공:', registration.scope);
      })
      .catch(error => {
        console.error('ServiceWorker 등록 실패:', error);
      });
  }
});
