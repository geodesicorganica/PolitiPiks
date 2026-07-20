import { expect, test } from '@playwright/test';

test('2026/live is the browser default and closed picks are disabled', async ({ page }) => {
  await page.goto('/?browser-test=active-cycle');
  await expect(page.getByRole('heading', { name: '2026 Live Races' })).toBeVisible();
  await expect(page.getByTestId('race-browser-open-2026')).toBeVisible();
  await expect(page.getByTestId('race-browser-closed-2026')).toContainText('Picking closed');
  await expect(page.getByTestId('race-browser-closed-2026').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('race-browser-missing-close-at-2026')).toContainText('Deadline unavailable');
  await expect(page.getByTestId('race-browser-missing-close-at-2026').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('race-fixture-race-2024-sandbox')).toHaveCount(0);
});
