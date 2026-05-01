'use strict';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function monogramSvg(name) {
  const letter = (name || '?').trim()[0].toUpperCase();
  // Deterministic bg color based on letter
  const palette = ['#2b4c7e', '#567ebb', '#606c38', '#283618', '#bc4749', '#4a4e69', '#9c6644'];
  const bg      = palette[letter.charCodeAt(0) % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
              `<rect width="64" height="64" fill="${bg}"/>` +
              `<text x="32" y="44" font-size="32" font-family="sans-serif" fill="#fff" text-anchor="middle">${letter}</text>` +
              `</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

async function resolveLogoUrl(domain) {
  try {
    const res = await fetch(`https://logo.clearbit.com/${domain}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? `https://logo.clearbit.com/${domain}` : null;
  } catch {
    return null;
  }
}

async function getOrgLogo(name) {
  if (!name) return { domain: null, logoUrl: monogramSvg('?') };
  const domain  = `${slugify(name)}.com`;
  const logoUrl = (await resolveLogoUrl(domain)) ?? monogramSvg(name);
  return { domain, logoUrl };
}

module.exports = { getOrgLogo };
