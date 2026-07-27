import { expect, test } from '@playwright/test';

test('2026/live is the browser default and closed picks are disabled', async ({ page }) => {
  await page.goto('/?browser-test=active-cycle');
  await expect(page.getByRole('heading', { name: '2026 Live Races' })).toBeVisible();
  await expect(page.getByText('Picks lock before Election Day under the current league safety policy.')).toBeVisible();
  await expect(page.getByText(/official state poll closing/i)).toHaveCount(0);
  await expect(page.getByTestId('race-2026-CA-senate-class-1')).toBeVisible();
  await expect(page.getByTestId('race-2026-CA-senate')).toHaveCount(0);
  await expect(page.getByTestId('race-2026-CA-governor')).toBeVisible();
  await expect(page.getByTestId('measure-browser-measure-2026')).toBeVisible();
  await expect(page.getByTestId('canonical-research')).toContainText('Canonical research available');
  await expect(page.getByTestId('canonical-metrics')).toContainText('Metrics available');
  await expect(page.getByTestId('picks-unavailable-2026-CA-senate-class-1')).toContainText('Picks not yet available');
  await expect(page.getByTestId('pick-fec-canonical')).toContainText('Picks not yet available');
  await expect(page.getByTestId('pick-fec-canonical')).toBeDisabled();
  await expect(page.getByTestId('race-2026-GA-senate-class-2')).toBeVisible();
  await expect(page.getByTestId('pick-fec-ballot-verified')).toContainText('Make pick');
  await expect(page.getByTestId('pick-fec-ballot-verified')).toBeEnabled();
  await page.getByTestId('pick-fec-ballot-verified').click();
  await expect(page.getByTestId('pick-fec-ballot-verified')).toContainText('Pick recorded');
  await expect(page.getByTestId('race-browser-closed-2026')).toContainText('Picking closed');
  await expect(page.getByTestId('race-browser-closed-2026').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('race-fixture-race-2024-sandbox')).toHaveCount(0);
});
