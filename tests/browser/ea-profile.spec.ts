import { test, expect } from '@playwright/test';

test('reviewed profiles render sources, attribution and honest missing fields', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?browser-test=ea-profile');
  await expect(page.getByRole('heading', { name: 'Reviewed candidate profile fixture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biography', exact: true })).toBeVisible();
  await expect(page.getByText('Candidate statement · From the campaign')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Visit campaign website' })).toHaveAttribute('href', 'https://example.org/campaign');
  await expect(page.getByText('The reviewed source does not publish this field.')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Electorate context' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Biography', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
