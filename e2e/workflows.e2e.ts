import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
  ;(page as typeof page & { browserErrors?: string[] }).browserErrors = browserErrors
})

test.afterEach(async ({ page }) => {
  const browserErrors = (page as typeof page & { browserErrors?: string[] }).browserErrors ?? []
  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})

async function enterWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /enter workspace/i }).click()
  await expect(page.getByRole('heading', { name: 'Voice procurement' })).toBeVisible()
}

test('voice request can be structured, reviewed, and created', async ({ page }) => {
  await enterWorkspace(page)
  await page.getByRole('button', { name: /Talk to Sarah|Start talking/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Sarah' })
  await dialog.getByLabel('Your request').fill('Need 30 kg of fresh halal chicken breast delivered to 24 Flinders Lane, Melbourne tomorrow before 8 am under $350 net 14 days and no deposit.')
  await dialog.getByRole('button', { name: /review structured request/i }).click()

  await expect(page.getByRole('dialog', { name: 'Review your request' })).toBeVisible()
  await expect(page.getByLabel('Structured request review')).toContainText('Structured locally')
  await expect(page.getByLabel('Item')).toHaveValue(/chicken breast/i)
  await expect(page.getByLabel('Quantity')).toHaveValue('30')
  await expect(page.getByLabel('Maximum budget (AUD)')).toHaveValue('350')
  await expect(page.getByLabel('Delivery address')).toHaveValue(/Flinders Lane/i)
  await page.getByRole('button', { name: /confirm & create request/i }).click()

  await expect(page.getByRole('heading', { name: 'Requests', exact: true }).first()).toBeVisible()
  await expect(page.getByText('Chicken breast', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Request created')
})

test('manual request wizard completes all controls', async ({ page }) => {
  await enterWorkspace(page)
  await page.getByRole('button', { name: /^Requests/ }).click()
  await page.getByRole('button', { name: 'Add Request' }).click()
  const wizard = page.getByRole('dialog', { name: 'Add request' })
  await wizard.getByLabel('Item or product').fill('Compostable cups')
  await wizard.getByLabel('Category').fill('Hospitality supplies')
  await wizard.getByLabel('Quantity').fill('500')
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByLabel('Maximum budget (AUD)').fill('240')
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByLabel('Minimum payment terms').selectOption('14')
  await wizard.getByLabel('Purchase approval').selectOption('confirm')
  await wizard.getByRole('button', { name: 'Add request' }).click()

  await expect(wizard).not.toBeVisible()
  await expect(page.getByRole('button', { name: /Compostable cups/i })).toBeVisible()
})

test('supplier import and call transcript workflows are reachable', async ({ page }) => {
  await enterWorkspace(page)
  await page.getByRole('button', { name: /^Suppliers$/ }).click()
  await page.getByRole('button', { name: 'Import supplier' }).click()
  const supplierDialog = page.getByRole('dialog', { name: 'Import supplier' })
  await supplierDialog.getByLabel('Business name').fill('E2E Wholesale')
  await supplierDialog.getByLabel('ABN').fill('51 824 753 556')
  await supplierDialog.getByLabel('Contact phone').fill('03 9000 0000')
  await supplierDialog.getByLabel('Supplier email').fill('orders@example.com')
  await supplierDialog.getByRole('button', { name: /check & queue for verification/i }).click()
  await expect(page.getByRole('heading', { name: 'E2E Wholesale' })).toBeVisible()
  await expect(page.getByText('Registry evidence pending')).toBeVisible()

  await page.getByRole('button', { name: 'Call activity', exact: true }).click()
  await page.getByRole('button', { name: /Victorian Foods/ }).click()
  await expect(page.getByRole('dialog', { name: 'Call transcript' })).toContainText('DEMO CALL TRANSCRIPT')
  await page.getByRole('button', { name: 'Back to workspace' }).click()
  await expect(page.getByRole('dialog', { name: 'Call transcript' })).not.toBeVisible()
})
