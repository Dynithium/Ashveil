export default async function run(page, ui) {
  await page.waitForTimeout(20000);
  const snap = await ui.snapshot();
  const m = snap.match(/@(e\d+) button "BEGIN THE LONG FALL"/);
  if (!m) return { error: "no begin button", snap };
  await page.locator(`[data-ab-ref="${m[1]}"]`).click({ force: true });
  await page.waitForTimeout(4000);
  const qa = new URL(page.url()).searchParams.get("qa");
  await page.screenshot({ path: `C:\\Users\\mmirz\\AppData\\Local\\Temp\\opencode\\qa6-${qa}.png` });
  return { qa };
}
