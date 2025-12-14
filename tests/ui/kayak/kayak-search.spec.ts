import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
 
const ORIGIN = process.env.ORIGIN ?? 'Dublin';
const DESTINATION = process.env.DESTINATION ?? 'London';
const DEPART_DATE = process.env.DEPART_DATE ?? '2026-01-20'; // ISO format (YYYY-MM-DD)

// helpers
async function setAirportField(page: Page, fieldNameRegex: RegExp, query: string) {
  const field = page.getByRole('combobox', { name: fieldNameRegex }).first()
    .or(page.getByRole('textbox', { name: fieldNameRegex }).first())
    .or(page.getByPlaceholder(fieldNameRegex).first());

  await expect(field).toBeVisible();
  await field.scrollIntoViewIfNeeded();

  // Clear any pre-filled chip/value
  const removeBtn = page.getByRole('button', { name: /remove value/i }).first();
  if (await removeBtn.isVisible().catch(() => false)) await removeBtn.click();

  await field.click();
  await field.press('Control+A').catch(async () => field.press('Meta+A'));
  await field.press('Delete').catch(() => {});
  await field.type(query, { delay: 40 });

  // --- Portal-safe popup resolution ---
  const popupId = await field.getAttribute('aria-controls');
  const listbox = popupId
    ? page.locator(`#${popupId}`)
    // portal fallback: the only visible suggestions list
    : page.locator('[role="listbox"]:visible').first();

  await expect(listbox).toBeVisible({ timeout: 10_000 });

  // Prefer the first option inside THIS listbox
  const topOption = listbox.getByRole('option').first();
  await topOption.click().catch(async () => {
    // keyboard fallback if click is flaky
    await field.press('ArrowDown');
    await field.press('Enter');
  });
}



function formatAriaDate(isoDate: string) {
  const d = new Date(isoDate);
  // Many travel pickers use aria-label like "January 20, 2026"
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

// Test
test('one-way flight search on Kayak', async ({ page }) => {
  await test.step('Open Kayak', async () => {
    await page.goto('https://www.kayak.com');
  });

  // await test.step('Handle consent if shown', async () => {
  //   const consentButton = page.getByRole('button', { name: /accept|agree|ok/i });
  //   if (await consentButton.isVisible().catch(() => false)) {
  //     await consentButton.click();
  //   }
  // });
  await test.step('Handle cookie consent (robust)', async () => {
    // The dialog appears late; wait for it to attach, but don't fail if it never shows.
    const consentDialog = page.getByRole('dialog').filter({ hasText: /cookie|consent/i });

    try {
      // Wait until the dialog is in the DOM (not necessarily visible yet).
      await consentDialog.waitFor({ state: 'attached', timeout: 8000 });

      // Prefer "Accept all"; fall back to "Reject all".
      const acceptAll = consentDialog.getByRole('button', { name: /accept all/i });
      const rejectAll = consentDialog.getByRole('button', { name: /reject all/i });

      const btn = (await acceptAll.isVisible().catch(() => false)) ? acceptAll : rejectAll;
      await btn.click();

      // Ensure overlay is gone before proceeding.
      await expect(consentDialog).toBeHidden();
    } catch {
      // Dialog never appeared within 8s — that's fine, continue.
    }
  });

  await test.step('Trip type → One-way', async () => {
    // Variant 1: compact layout (radiogroup)
    const radios = page.getByRole('radiogroup', { name: /trip type/i }).first();
    if (await radios.isVisible().catch(() => false)) {
      const oneWayRadio = radios.getByRole('radio', { name: /one[-\s]?way/i }).first();
      if ((await oneWayRadio.getAttribute('aria-checked')) !== 'true') {
        await oneWayRadio.click();
        await expect(oneWayRadio).toHaveAttribute('aria-checked', 'true');
      }
      return; // done for compact layout
    }

    // Variant 2: desktop layout (combobox + popup)
    const tripType = page
      .locator('[role="combobox"][aria-controls]')
      .filter({ hasText: /Return|One[-\s]?way|Multi[-\s]?city/i })
      .first();

    await expect(tripType).toBeVisible();

    // Already one-way? bail.
    const currentLabel = (await tripType.getAttribute('aria-label')) ?? '';
    if (/one[-\s]?way/i.test(currentLabel)) return;

    // Open and wait until expanded
    await tripType.scrollIntoViewIfNeeded();
    await tripType.click();
    await expect(tripType).toHaveAttribute('aria-expanded', 'true');

    // Use the exact popup controlled by this combobox
    const popupId = await tripType.getAttribute('aria-controls');
    const popup = popupId
      ? page.locator(`#${popupId}`)
      : page.getByRole('listbox', { name: /trip type/i });

    await popup.waitFor({ state: 'visible', timeout: 10_000 });

    // Prefer the ARIA option inside the listbox; fall back to radio variant.
    // (No getByText/button fallbacks — avoids multiple matches.)
    const oneWayOption = popup.getByRole('option', { name: /^One-way$/i });

    if (await oneWayOption.count()) {
      await expect(oneWayOption).toHaveCount(1); // sanity check in strict mode
      await oneWayOption.first().click();
    } else {
      const oneWayRadio = popup.getByRole('radio', { name: /^One-way$/i }).first();
      await oneWayRadio.click();
    }

    // Verify on the control itself
    await expect(tripType).toHaveAttribute('aria-label', /Trip type.*One[-\s]?way/i);

  });


  await test.step('Fill From/To', async () => {
    await setAirportField(page, /from|origin|departure/i, ORIGIN);
    await setAirportField(page, /to|destination|arrival/i, DESTINATION);
  });
  await test.step('Select departure date', async () => {
    const dateButton = page.getByRole('button', { name: /depart|date|departure/i }).first()
      .or(page.locator('[data-testid*="date"] button').first());
    await dateButton.click();

    const aria = formatAriaDate(DEPART_DATE);
    await page.getByRole('button', { name: new RegExp(`^${aria}$`, 'i') }).click();

    const apply = page.getByRole('button', { name: /done|apply|save|close/i }).first();
    if (await apply.isVisible().catch(() => false)) {
      await apply.click();
    }
  });

  await test.step('Search', async () => {
    await page.getByRole('button', { name: /search/i }).click();
    // Wait for results UI to appear
    await page.getByText(/filters|stops|airlines|price/i).first().waitFor({ timeout: 60_000 });
  });

  await test.step('Apply Nonstop filter', async () => {
    const nonstop = page.getByRole('checkbox', { name: /non[-\s]?stop/i });
    if (await nonstop.isVisible().catch(() => false)) {
      await nonstop.check().catch(async () => nonstop.click());
    } else {
      const nonstopPill = page.getByRole('button', { name: /non[-\s]?stop/i }).first();
      if (await nonstopPill.isVisible().catch(() => false)) await nonstopPill.click();
    }
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
  });

  await test.step('Assertions on first result', async () => {
    const firstResult =
      page.locator('[data-test-result], [data-result], [data-testid*="result"]').first()
        .or(page.getByRole('article').first());
    await firstResult.waitFor({ timeout: 60_000 });

    // Nonstop shown in meta
    await expect(firstResult.getByText(/non[-\s]?stop/i).first()).toBeVisible();

    // Route contains origin and destination (defensive)
    await expect(firstResult.getByText(new RegExp(ORIGIN.split(',')[0], 'i'))).toBeVisible();
    await expect(firstResult.getByText(new RegExp(DESTINATION.split(',')[0], 'i'))).toBeVisible();

    // Date appears (month-name format)
    await expect(firstResult.getByText(new RegExp(formatAriaDate(DEPART_DATE), 'i'))).toBeVisible();
  });
});

