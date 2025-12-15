import { test } from '@playwright/test';
import { FlightSearchPage } from './pages/FlightSearchPage';

const ORIGIN = process.env.ORIGIN ?? 'Dublin';
const DESTINATION = process.env.DESTINATION ?? 'London';
const DEPART_DATE = process.env.DEPART_DATE ?? '2026-01-20';

test('one-way flight search on Kayak', async ({ page }) => {
  const kayak = new FlightSearchPage(page);

  await test.step('Open + cookies', async () => {
    await kayak.goto();
    await kayak.handleCookies();
  });

  await test.step('Trip type → One-way', async () => {
    await kayak.setTripTypeOneWay();
  });

  await test.step('Fill From/To', async () => {
    await kayak.origin.set(ORIGIN);
    await kayak.destination.set(DESTINATION);
  });

  // await test.step('Select departure date', async () => {
  //   await kayak.pickDepartureDate(DEPART_DATE);
  // });

  // await test.step('Search', async () => {
  //   await kayak.clickSearch();
  // });

  // await test.step('Apply Nonstop filter', async () => {
  //   await kayak.applyNonstopFilter();
  // });

  // await test.step('Assertions', async () => {
  //   await kayak.assertFirstResult(ORIGIN, DESTINATION, DEPART_DATE);
  // });
});
