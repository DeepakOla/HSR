import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';

describe('⚡ HSR Management Portal Unified Theme & Responsive Navigation', () => {
  it('verifies AdminLayout implements Zen Dock sidebar with collapsible controls', async () => {
    const layout = await fs.readFile('src/layouts/AdminLayout.astro', 'utf-8');

    // Structural elements
    expect(layout).toContain('id="mgmt-sidebar"');
    expect(layout).toContain('id="mgmt-canvas"');
    expect(layout).toContain('id="sidebar-toggle-btn"');
    expect(layout).toContain('id="sidebar-backdrop"');

    // Navigation links
    expect(layout).toContain('/admin/');
    expect(layout).toContain('/admin/reception/');
    expect(layout).toContain('/staff/testing/');
    expect(layout).toContain('/admin/cylinder-register/');
    expect(layout).toContain('/admin/records/');
    expect(layout).toContain('/admin/finance/');
    expect(layout).toContain('/admin/owner/');
    expect(layout).toContain('/admin/reminders/');
    expect(layout).toContain('/admin/bays-equipment/');
    expect(layout).toContain('/api/auth/logout/');

    // Dark mode and telemetry
    expect(layout).toContain('toggleTheme');
    expect(layout).toContain('300 BAR READY');
    expect(layout).toContain('Station Lab #941');
  });

  it('verifies admin.css contains complete Precision Hydro Test design tokens', async () => {
    const css = await fs.readFile('src/styles/admin.css', 'utf-8');

    // Key layout classes
    expect(css).toContain('.admin-app');
    expect(css).toContain('.admin-heading');
    expect(css).toContain('.admin-card');
    expect(css).toContain('.admin-metrics');
    expect(css).toContain('.admin-metric-value');
    expect(css).toContain('.admin-button');
    expect(css).toContain('.admin-table');
    expect(css).toContain('.admin-table-wrap');
    expect(css).toContain('.admin-slot-list');
    expect(css).toContain('.admin-field');
    expect(css).toContain('.admin-input');
    expect(css).toContain('.admin-status');

    // Owner CMS classes
    expect(css).toContain('.owner-section');
    expect(css).toContain('.owner-grid');
    expect(css).toContain('.owner-category');
    expect(css).toContain('.owner-tab');

    // Dark mode classes
    expect(css).toContain('html.dark');
  });

  it('verifies /admin/cylinder-register.astro exists and renders RegisterConsole', async () => {
    const page = await fs.readFile('src/pages/admin/cylinder-register.astro', 'utf-8');
    expect(page).toContain('RegisterConsole');
    expect(page).toContain('AdminLayout');
    expect(page).toContain('activeNav="register"');
  });

  it('verifies StaffLayout delegates to AdminLayout for 100% unified management experience', async () => {
    const staffLayout = await fs.readFile('src/layouts/StaffLayout.astro', 'utf-8');
    expect(staffLayout).toContain('import AdminLayout from \'./AdminLayout.astro\';');
    expect(staffLayout).toContain('<AdminLayout');
  });

  it('verifies records.astro provides organized tab navigation and live search filter', async () => {
    const records = await fs.readFile('src/pages/admin/records.astro', 'utf-8');
    expect(records).toContain('switchTab');
    expect(records).toContain('filterRecordsTable');
    expect(records).toContain('records-search-input');
    expect(records).toContain('admin-table');
  });
});
