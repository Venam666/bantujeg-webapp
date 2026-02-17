import { runtimeState } from './state.js';
import { fetchPricingConfig } from './api.js';

const PRICING_UNAVAILABLE_TEXT = 'Pricing unavailable';

function getServicePricingConfig(config, serviceType) {
  if (!config || typeof config !== 'object') return null;
  const buckets = [config.services, config.service_types, config.serviceTypes, config.by_service, config];
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'object') continue;
    const item = bucket[serviceType];
    if (item && typeof item === 'object') return item;
  }
  return null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolve(serviceCfg, globalCfg, keys) {
  for (const key of keys) {
    const s = num(serviceCfg?.[key]);
    if (s !== null) return s;
    const g = num(globalCfg?.[key]);
    if (g !== null) return g;
  }
  return null;
}

export async function loadConfig() {
  try {
    const payload = await fetchPricingConfig();
    const config = payload?.config || payload?.data || payload || null;

    // STRICT VALIDATION
    if (!config || typeof config !== 'object') {
      throw new Error(PRICING_UNAVAILABLE_TEXT);
    }

    runtimeState.updateState((s) => {
      s.pricing.config = config;
      s.pricing.available = true;
      s.pricing.error = null;
    });
    return true;
  } catch (err) {
    console.error('[PRICING] Failed to load config:', err);
    // FAIL CLOSED - No Fallback
    runtimeState.updateState((s) => {
      s.pricing.config = null;
      s.pricing.available = false;
      s.pricing.estimate = null;
      s.pricing.error = PRICING_UNAVAILABLE_TEXT;
    });
    return false;
  }
}

export function calculatePreview({ distanceKm, serviceType, carOptions }) {
  const state = runtimeState.getState();
  const config = state.pricing.config; // No fallback

  if (!config) return null;

  const serviceCfg = getServicePricingConfig(config, serviceType);
  if (!serviceCfg) return null;

  const base = resolve(serviceCfg, config, ['base', 'baseFare', 'base_fare']);
  const perKm = resolve(serviceCfg, config, ['perKm', 'per_km', 'distanceRate', 'distance_rate']);
  const roundTo = resolve(serviceCfg, config, ['roundTo', 'round_to', 'rounding']) || 1;
  const promoMultiplier = resolve(serviceCfg, config, ['promoMultiplier', 'promo_multiplier']) || 1;
  const seatMultiplier = carOptions?.seats === 6
    ? resolve(serviceCfg, config, ['sixSeatMultiplier', 'six_seat_multiplier', 'seat6Multiplier'])
    : null;

  if (base === null || perKm === null) {
    runtimeState.updateState((s) => {
      s.pricing.available = false;
      s.pricing.estimate = null;
      s.pricing.error = PRICING_UNAVAILABLE_TEXT;
    });
    return null;
  }

  let price = base + (distanceKm * perKm);
  if (seatMultiplier !== null) price *= seatMultiplier;
  price = Math.ceil(price / roundTo) * roundTo;
  const fakePrice = Math.ceil((price * promoMultiplier) / roundTo) * roundTo;

  const estimate = { distanceKm, price, fakePrice };
  runtimeState.updateState((s) => {
    s.pricing.available = true;
    s.pricing.error = null;
    s.pricing.estimate = estimate;
    s.serviceType = serviceType;
  });
  return estimate;
}
