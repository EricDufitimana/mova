import { test, expect } from '@playwright/test';

test('driver plate connects and recovers when state requests exceed the polling interval', async ({page}) => {
  let available = true;
  await page.route('**/api/driver/select', route => route.fulfill({json:{token:'a'.repeat(64), role:'driver', vehicleId:'mv-201'}}));
  await page.route('**/api/state', async route => {
    await new Promise(resolve => setTimeout(resolve, 2200));
    if (!available) return route.abort('connectionfailed');
    await route.fulfill({json:{role:'driver', vehicleId:'mv-201', rides:[], vehicles:[]}});
  });
  await page.goto('/#driver');
  await page.getByRole('button', {name:'Go online with this plate', exact:true}).click();
  await expect(page.getByRole('heading', {name:'RAD 482 F', exact:true})).toBeVisible({timeout:10000});
  await expect(page.getByText('Online', {exact:true})).toBeVisible();
  available = false;
  await expect(page.getByText('Reconnecting', {exact:true})).toBeVisible({timeout:15000});
  available = true;
  await expect(page.getByText('Online', {exact:true})).toBeVisible({timeout:15000});
});

test('driver gets a server availability message when API requests return a static page', async ({page}) => {
  await page.route('**/api/driver/select', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Mova</title>'}));
  await page.goto('/#driver');
  await page.getByRole('button', {name:'Go online with this plate', exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('The ride server is unavailable at this address.');
  await expect(page.getByRole('button', {name:'Go online with this plate', exact:true})).toBeEnabled();
});

test('customer retries a failed initial connection without a page reload', async ({page}) => {
  let attempts = 0;
  await page.route('**/api/session', route => {
    attempts++;
    return attempts === 1 ? route.abort('connectionfailed') : route.fulfill({json:{token:'b'.repeat(64)}});
  });
  await page.route('**/api/state', route => route.fulfill({json:{rides:[], vehicles:[]}}));
  await page.goto('/');
  await expect(page.getByText('Shared ride server connected', {exact:true})).toBeVisible({timeout:10000});
  expect(attempts).toBe(2);
});
