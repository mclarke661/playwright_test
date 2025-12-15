import { expect, type Page, type Locator } from '@playwright/test';

export class AirportField {
  constructor(private page: Page, private fieldNameRegex: RegExp) {}

  private get input(): Locator {
    // Prefer combobox, fall back to textbox / placeholder
    return this.page.getByRole('combobox', { name: this.fieldNameRegex }).first()
      .or(this.page.getByRole('textbox', { name: this.fieldNameRegex }).first())
      .or(this.page.getByPlaceholder(this.fieldNameRegex).first());
  }

  async set(value: string) {
    const field = this.input;
    await expect(field).toBeVisible();
    await field.scrollIntoViewIfNeeded();

    // Clear any pre-filled chip/value
    const removeBtn = this.page.getByRole('button', { name: /remove value/i }).first();
    if (await removeBtn.isVisible().catch(() => false)) await removeBtn.click();

    await field.click();
    await field.press('Control+A').catch(async () => field.press('Meta+A'));
    await field.press('Delete').catch(() => {});
    await field.type(value, { delay: 40 });

    // Resolve suggestions list safely (portal-aware)
    const popupId = await field.getAttribute('aria-controls');
    const listbox = popupId
      ? this.page.locator(`#${popupId}`)
      : this.page.locator('[role="listbox"]:visible').first();

    await expect(listbox).toBeVisible({ timeout: 10_000 });

    // Click top suggestion; fallback to keyboard if click is flaky
    const topOption = listbox.getByRole('option').first();
    await topOption.click().catch(async () => {
      await field.press('ArrowDown');
      await field.press('Enter');
    });
  }
}
