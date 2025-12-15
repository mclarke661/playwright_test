import { expect, type Page } from '@playwright/test';
import { AirportField } from './components/AirportFields.ts';

export class FlightSearchPage {
  readonly origin: AirportField;
  readonly destination: AirportField;

  constructor(private page: Page) {
    this.origin = new AirportField(page, /from|origin|departure/i);
    this.destination = new AirportField(page, /to|destination|arrival/i);
  }

  async goto() {
    await this.page.goto('https://www.kayak.com');
  }

  async handleCookies() {
    const dlg = this.page.getByRole('dialog').filter({ hasText: /cookie|consent/i });
    try {
      await dlg.waitFor({ state: 'attached', timeout: 8000 });
      const accept = dlg.getByRole('button', { name: /accept all/i });
      const reject = dlg.getByRole('button', { name: /reject all/i });
      const btn = (await accept.isVisible().catch(() => false)) ? accept : reject;
      await btn.click();
      await expect(dlg).toBeHidden();
    } catch { /* not shown */ }
  }

  async setTripTypeOneWay() {
    // Variant 1: compact radiogroup
    const radios = this.page.getByRole('radiogroup', { name: /trip type/i }).first();
    if (await radios.isVisible().catch(() => false)) {
      const one = radios.getByRole('radio', { name: /one[-\s]?way/i }).first();
      if ((await one.getAttribute('aria-checked')) !== 'true') {
        await one.click();
        await expect(one).toHaveAttribute('aria-checked', 'true');
      }
      return;
    }

    // Variant 2: combobox + popup
    const tripType = this.page
      .locator('[role="combobox"][aria-controls]')
      .filter({ hasText: /Return|One[-\s]?way|Multi[-\s]?city/i })
      .first();

    await expect(tripType).toBeVisible();

    const current = (await tripType.getAttribute('aria-label')) ?? '';
    if (/one[-\s]?way/i.test(current)) return;

    await tripType.scrollIntoViewIfNeeded();
    await tripType.click();
    await expect(tripType).toHaveAttribute('aria-expanded', 'true');

    const popupId = await tripType.getAttribute('aria-controls');
    const popup = popupId ? this.page.locator(`#${popupId}`) : this.page.getByRole('listbox', { name: /trip type/i });
    await popup.waitFor({ state: 'visible', timeout: 10_000 });

    const oneWayOption = popup.getByRole('option', { name: /^One-way$/i });
    if (await oneWayOption.count()) {
      await expect(oneWayOption).toHaveCount(1);
      await oneWayOption.first().click();
    } else {
      await popup.getByRole('radio', { name: /^One-way$/i }).first().click();
    }

    await expect(tripType).toHaveAttribute('aria-label', /Trip type.*One[-\s]?way/i);
  }

  async pickDepartureDate(iso: string) {
    const dateBtn = this.page.getByRole('button', { name: /depart|date|departure/i }).first()
      .or(this.page.locator('[data-testid*="date"] button').first());
    await dateBtn.click();

    const label = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      .format(new Date(iso));
    const day = this.page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });

    if (await day.count()) {
      await day.first().click();
    } else {
      for (let i = 0; i < 12; i++) {
        const next = this.page.getByRole('button', { name: /next month|next/i }).first()
          .or(this.page.locator('[aria-label*="Next"]').first());
        await next.click();
        if (await day.isVisible().catch(() => false)) { await day.first().click(); break; }
      }
    }

    const apply = this.page.getByRole('button', { name: /done|apply|save|close/i }).first();
    if (await apply.isVisible().catch(() => false)) await apply.click();
  }

  async clickSearch() {
    await this.page.getByRole('button', { name: /search/i }).click();
    await this.page.getByText(/filters|stops|airlines|price/i).first().waitFor({ timeout: 60_000 });
  }

  async applyNonstopFilter() {
    const cb = this.page.getByRole('checkbox', { name: /non[-\s]?stop/i });
    if (await cb.isVisible().catch(() => false)) {
      await cb.check().catch(async () => cb.click());
    } else {
      const pill = this.page.getByRole('button', { name: /non[-\s]?stop/i }).first();
      if (await pill.isVisible().catch(() => false)) await pill.click();
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
  }

  async assertFirstResult(origin: string, destination: string, iso: string) {
    const first =
      this.page.locator('[data-test-result], [data-result], [data-testid*="result"]').first()
        .or(this.page.getByRole('article').first());
    await first.waitFor({ timeout: 60_000 });

    // Optional: expand details if available
    const details = first.getByRole('button', { name: /details|more|itinerary|view/i }).first()
      .or(first.locator('[data-testid*="details"], [aria-expanded="false"]').first());
    if (await details.isVisible().catch(() => false)) await details.click();

    await expect(first.getByText(/non[-\s]?stop/i).first()).toBeVisible();
    await expect(first.getByText(new RegExp(origin.split(',')[0], 'i'))).toBeVisible();
    await expect(first.getByText(new RegExp(destination.split(',')[0], 'i'))).toBeVisible();

    const pretty = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      .format(new Date(iso));
    await expect(first.getByText(new RegExp(pretty, 'i'))).toBeVisible();
  }
}
