import { Page, Locator, expect } from '@playwright/test';

export class AirportField {
  constructor(private page: Page, private name: RegExp) {}

  private get root(): Locator {
    return this.page.getByRole('combobox', { name: this.name }).first()
      .or(this.page.getByRole('textbox', { name: this.name }).first())
      .or(this.page.getByPlaceholder(this.name).first());
  }

  async set(value: string) {
    const field = this.root;
    await expect(field).toBeVisible();
    await field.scrollIntoViewIfNeeded();

    const remove = this.page.getByRole('button', { name: /remove value/i }).first();
    if (await remove.isVisible().catch(() => false)) await remove.click();

    await field.click(); 
    await field.press('Control+A').catch(async () => field.press('Meta+A'));
    await field.press('Delete').catch(() => {});
    await field.type(value, { delay: 40 });

    // Resolve the portal/listbox that belongs to this field
    const popupId = await field.getAttribute('aria-controls');
    const listbox = popupId
      ? this.page.locator(`#${popupId}`)
      : this.page.locator('[role="listbox"]:visible').first();

    await expect(listbox).toBeVisible({ timeout: 10_000 });
    await listbox.getByRole('option').first().click().catch(async () => {
      await field.press('ArrowDown');
      await field.press('Enter');
    });
  }
}
