/**
 * Build-time integration URLs for Zoe Life.
 *
 * Ordinary builds (no --staging): env vars override; if an env var is absent,
 * keep the existing non-null https value already in js/config.js (or the
 * checked-in live defaults below). A rebuild without env therefore cannot
 * erase the live FormSubmit and Google Calendar URLs.
 *
 * Staging / --staging stays fail-closed when there is nothing to preserve:
 * unset env and no existing value stay null. Env still overrides when set.
 * Marketplace and payment URLs have no defaults and stay null until supplied.
 */

import { readFileSync } from "node:fs";

export const LIVE_FORM_ENDPOINT = "https://formsubmit.co/ajax/contact@zoelifehub.com";
export const LIVE_BOOKING_URL = "https://calendar.app.google/Uj9v44HE72kJrKz8A";

export const LIVE_DEFAULTS = {
  formEndpoint: LIVE_FORM_ENDPOINT,
  newsletterEndpoint: LIVE_FORM_ENDPOINT,
  bookingUrl: LIVE_BOOKING_URL,
};

export const PAYMENT_CHANNELS = [
  { key: "amazon", label: "Buy on Amazon", btnClass: "btn-primary", env: (book) => `ZOE_AMAZON_${book.toUpperCase()}_URL` },
  { key: "etsy", label: "Buy on Etsy", btnClass: "btn-secondary", env: (book) => `ZOE_ETSY_${book.toUpperCase()}_URL` },
  { key: "gumroad", label: "Buy on Gumroad", btnClass: "btn-secondary", env: (book) => `ZOE_GUMROAD_${book.toUpperCase()}_URL` },
  { key: "stripe", label: "Pay with Stripe", btnClass: "btn-primary", env: (book) => `ZOE_STRIPE_${book.toUpperCase()}_URL` },
  { key: "paypal", label: "Pay with PayPal", btnClass: "btn-secondary", env: (book) => `ZOE_PAYPAL_${book.toUpperCase()}_URL` },
];

export const BOOKS = ["devotional", "journal"];

export function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nonempty(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function httpsOnly(value, name, { invalid = "throw" } = {}) {
  const trimmed = nonempty(value);
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    if (invalid === "null") return null;
    throw new Error(`${name} is not a valid URL: ${trimmed}`);
  }

  if (url.protocol !== "https:") {
    if (invalid === "null") return null;
    throw new Error(`${name} must be an https URL (rejected ${url.protocol}): ${trimmed}`);
  }

  return trimmed;
}

export function loadExistingConfig(configPath) {
  try {
    const text = readFileSync(configPath, "utf8");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

/**
 * Env wins when set. Otherwise keep an existing non-null https value.
 * Staging fail-closed: no env and no existing value → null (skip defaults).
 * Ordinary builds may fall back to checked-in live defaults for form/booking.
 */
export function pickHttps({ envValue, existingValue, name, failClosed = false, defaultValue = null }) {
  const fromEnv = nonempty(envValue);
  if (fromEnv) return httpsOnly(fromEnv, name);

  const fromExisting = httpsOnly(existingValue, name, { invalid: "null" });
  if (fromExisting) return fromExisting;

  if (failClosed) return null;
  return httpsOnly(defaultValue, name, { invalid: "null" });
}

function emptyBookPayments() {
  return Object.fromEntries(PAYMENT_CHANNELS.map((ch) => [ch.key, null]));
}

export function resolveBookPayments(book, env, existingBook) {
  const prior = existingBook && typeof existingBook === "object" ? existingBook : {};
  const out = emptyBookPayments();
  for (const channel of PAYMENT_CHANNELS) {
    out[channel.key] = pickHttps({
      envValue: env[channel.env(book)],
      existingValue: prior[channel.key],
      name: channel.env(book),
      failClosed: true,
    });
  }
  return out;
}

export function resolveIntegrations({ env = {}, existing = {}, staging = false } = {}) {
  const failClosed = Boolean(staging);
  return {
    formEndpoint: pickHttps({
      envValue: env.ZOE_FORM_ENDPOINT,
      existingValue: existing.formEndpoint,
      name: "ZOE_FORM_ENDPOINT",
      failClosed,
      defaultValue: LIVE_DEFAULTS.formEndpoint,
    }),
    newsletterEndpoint: pickHttps({
      envValue: env.ZOE_NEWSLETTER_ENDPOINT,
      existingValue: existing.newsletterEndpoint,
      name: "ZOE_NEWSLETTER_ENDPOINT",
      failClosed,
      defaultValue: LIVE_DEFAULTS.newsletterEndpoint,
    }),
    bookingUrl: pickHttps({
      envValue: env.ZOE_GOOGLE_CALENDAR_BOOKING_URL || env.ZOE_BOOKING_URL,
      existingValue: existing.bookingUrl,
      name: "ZOE_GOOGLE_CALENDAR_BOOKING_URL",
      failClosed,
      defaultValue: LIVE_DEFAULTS.bookingUrl,
    }),
    payments: {
      devotional: resolveBookPayments("devotional", env, existing.payments?.devotional),
      journal: resolveBookPayments("journal", env, existing.payments?.journal),
    },
  };
}

export function hasBuyLinks(bookPayments) {
  return PAYMENT_CHANNELS.some((ch) => bookPayments?.[ch.key]);
}

export function buyButtonsHtml(bookPayments) {
  const buttons = [];
  for (const channel of PAYMENT_CHANNELS) {
    const href = bookPayments?.[channel.key];
    if (!href) continue;
    buttons.push(
      `<a class="btn ${channel.btnClass}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${channel.label}<span class="visually-hidden">, opens in a new tab</span></a>`
    );
  }
  if (!buttons.length) {
    return `<p class="purchase-coming">Purchase options coming. Amazon, Etsy, Gumroad, Stripe, and PayPal checkout will appear here once Zoe Life publishes live links. Printed copies will be fulfilled by a print-on-demand partner. Zoe Life is not packing and shipping orders from home.</p>`;
  }
  return `<div class="pay-row">${buttons.join("")}</div>
        <p class="format-meta">Printed copies, when offered, will be fulfilled by a print-on-demand partner.</p>`;
}
