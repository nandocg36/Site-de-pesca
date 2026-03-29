import { expect, test } from '@playwright/test';

test.describe('@pesca/web smoke (preview)', () => {
  test('página inicial carrega', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Marco 1');
  });

  test('rota de convite', async ({ page }) => {
    await page.goto('/convite');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('convite');
  });

  test('rota instalar PWA', async ({ page }) => {
    await page.goto('/instalar-pwa');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/Instalar|PWA instalada/);
  });

  test('carteirinha pede convite sem sessão', async ({ page }) => {
    await page.goto('/carteirinha');
    await expect(page.getByText(/Inicia sessão|convite/i).first()).toBeVisible();
  });

  test('mensalidade pede sessão sócio sem convite', async ({ page }) => {
    await page.goto('/mensalidade');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mensalidade');
    await expect(page.getByText(/sócios com sessão|convite/i).first()).toBeVisible();
  });
});
