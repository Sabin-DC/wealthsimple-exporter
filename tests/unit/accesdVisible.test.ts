// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AccesDParseError, parseAccesDAmount, parseVisibleAccesDTransactions } from '../../src/utils/accesdVisible';
import { generateCSV } from '../../src/utils/exporters/csv';

const table = (rows: string) => `
  <h2>September 2026</h2>
  <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>`;

afterEach(() => { document.body.innerHTML = ''; });

describe('AccèsD visible checking transactions', () => {
  it('reads the selected month table and keeps category, detail, and debit sign', () => {
    document.body.innerHTML = table(`
      <tr><td>SEP 22</td><td><div>Retail stores - Other</div><div>Purchase /DEP/Corner, Market</div></td><td><span>−</span><span>1,234.56 $</span></td></tr>
      <tr><td>SEP 18</td><td>Payroll</td><td>2,000.00 $</td></tr>`);
    const transactions = parseVisibleAccesDTransactions();
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      date: '2026-09-22', category: 'Retail stores - Other',
      description: 'Purchase /DEP/Corner, Market', amount: -1234.56, accountId: '',
    });
    expect(transactions[1]).toMatchObject({ date: '2026-09-18', amount: 2000 });
  });

  it('reads the Montant column in a five-cell French row and ignores balance and action text', () => {
    document.body.innerHTML = `
      <h2>Septembre 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th><th></th></tr></thead>
      <tbody><tr>
        <td>22 SEP <span>22 septembre</span></td>
        <td><div>Magasins de détail - Autre</div><div>Achat /EXEMPLE</div></td>
        <td>−12,34 $</td><td>86,08 $</td>
        <td><button>22 septembre Achat /EXEMPLE −99,99 $</button></td>
      </tr></tbody></table>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-22', category: 'Magasins de détail - Autre',
        description: 'Achat /EXEMPLE', amount: -12.34 },
    ]);
  });

  it('reads short French dates repeated with a full month label', () => {
    document.body.innerHTML = `
      <h2>Août 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th><th></th></tr></thead>
      <tbody><tr><td>31 AOÛ 31 août</td><td>Purchase</td><td>−4,42 $</td><td>86,08 $</td><td></td></tr></tbody></table>
      <h2>Juin 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th><th></th></tr></thead>
      <tbody><tr><td>30 JUI 30 juin</td><td>Deposit</td><td>5,00 $</td><td>91,08 $</td><td></td></tr></tbody></table>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-08-31', description: 'Purchase', amount: -4.42 },
      { date: '2026-06-30', description: 'Deposit', amount: 5 },
    ]);
  });

  it('rejects conflicting duplicate date labels', () => {
    document.body.innerHTML = `
      <h2>Août 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody><tr><td>31 AOÛ 30 août</td><td>Purchase</td><td>−4,42 $</td></tr></tbody></table>`;
    expect(() => parseVisibleAccesDTransactions()).toThrow('No CSV was created.');
  });

  it('rejects an unreadable Montant cell even when Solde contains a valid amount', () => {
    document.body.innerHTML = `
      <h2>Septembre 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th><th></th></tr></thead>
      <tbody><tr><td>22 SEP</td><td>Purchase</td><td>unavailable</td><td>86,08 $</td>
      <td><button>Purchase −12,34 $</button></td></tr></tbody></table>`;
    try {
      parseVisibleAccesDTransactions();
      throw new Error('Expected an AccèsD parse error');
    } catch (error) {
      expect(error).toBeInstanceOf(AccesDParseError);
      const diagnostic = (error as AccesDParseError).diagnostic;
      expect(diagnostic).toContain('reason=amount');
      expect(diagnostic).toContain('amountColumn=3');
      expect(diagnostic).toContain('amountPattern=AAAAAAAAAAA');
      expect(diagnostic).not.toContain('86,08');
      expect(diagnostic).not.toContain('Purchase');
    }
  });

  it('exports checking pending rows from a separate section with displayed amount signs', () => {
    document.body.innerHTML = `
      <h2>Transactions en attente</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th></tr></thead>
      <tbody>
        <tr><td>22 SEP 22 septembre</td><td><div>Retail stores - Other</div><div>Pending purchase</div></td><td>−12,34 $</td><td>86,08 $</td></tr>
        <tr><td>21 SEP 21 septembre</td><td>Pending deposit</td><td>5,00 $</td><td>91,08 $</td></tr>
      </tbody></table>
      <h2>Septembre 2026</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Solde</th></tr></thead>
      <tbody><tr><td>18 SEP</td><td>Posted</td><td>−3,00 $</td><td>88,08 $</td></tr></tbody></table>`;
    const transactions = parseVisibleAccesDTransactions();
    expect(transactions).toMatchObject([
      { date: '2026-09-22', description: 'Pending purchase',
        category: 'Pending transaction | Retail stores - Other', amount: -12.34 },
      { date: '2026-09-21', description: 'Pending deposit', category: 'Pending transaction', amount: 5 },
      { date: '2026-09-18', description: 'Posted', amount: -3 },
    ]);
    const csv = generateCSV(transactions);
    expect(csv).toContain('2026-09-22,Pending purchase,Pending transaction | Retail stores - Other,12.34,');
    expect(csv).toContain('2026-09-21,Pending deposit,Pending transaction,,5.00');
  });

  it('refuses an ambiguous checking pending year', () => {
    document.body.innerHTML = `
      <h2>En attente</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody><tr><td>22 SEP</td><td>Pending purchase</td><td>−12,34 $</td></tr></tbody></table>
      <h2>Septembre 2025</h2><h2>Septembre 2026</h2>`;
    expect(() => parseVisibleAccesDTransactions()).toThrow('unique year');
  });

  it('does not use a credit-card heading to date a checking pending section', () => {
    document.body.innerHTML = `
      <h2>Transactions en attente</h2>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody><tr><td>22 SEP</td><td>Pending purchase</td><td>−12,34 $</td></tr></tbody></table>
      <h2>Facturées en septembre 2026</h2>`;
    expect(() => parseVisibleAccesDTransactions()).toThrow('unique year');
  });

  it('reads a div-based French table and ignores hidden rows', () => {
    document.body.innerHTML = `
      <h2>Septembre 2026</h2><div id="section">
      <div><div>Date</div><div>Description</div><div>Montant</div></div>
      <div><div>15 sept.</div><div>Achat</div><div>− 12,34 $</div></div>
      <div style="display:none"><div>14 sept.</div><div>Hidden</div><div>9,00 $</div></div>
      </div>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-15', description: 'Achat', amount: -12.34 },
    ]);
  });

  it('stops instead of exporting a partial file when a displayed amount cannot be read', () => {
    document.body.innerHTML = table('<tr><td>SEP 22</td><td>Purchase</td><td>unavailable</td></tr>');
    expect(() => parseVisibleAccesDTransactions()).toThrow('No CSV was created.');
  });

  it('reports a masked diagnostic without merchant text or raw amounts', () => {
    document.body.innerHTML = table('<tr><td>SEP 22</td><td>Private Merchant</td><td>123.45 CAD</td></tr>');
    try {
      parseVisibleAccesDTransactions();
      throw new Error('Expected an AccèsD parse error');
    } catch (error) {
      expect(error).toBeInstanceOf(AccesDParseError);
      const diagnostic = (error as AccesDParseError).diagnostic;
      expect(diagnostic).toContain('reason=amount');
      expect(diagnostic).toContain('datePattern=AAA 99');
      expect(diagnostic).toContain('amountPattern=999.99 AAA');
      expect(diagnostic).not.toContain('Private Merchant');
      expect(diagnostic).not.toContain('123.45');
      expect(diagnostic).not.toContain('SEP 22');
    }
  });

  it('exports multiple visible month sections from one checking account', () => {
    document.body.innerHTML = table('<tr><td>SEP 22</td><td>Purchase</td><td>− 12.00</td></tr>') +
      '<h2>August 2026</h2><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>' +
      '<tbody><tr><td>AUG 31</td><td>Deposit</td><td>10.00</td></tr></tbody></table>';
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-22', description: 'Purchase', amount: -12 },
      { date: '2026-08-31', description: 'Deposit', amount: 10 },
    ]);
  });

  it('reads multiple div-based month sections without repeating rows', () => {
    document.body.innerHTML = `
      <h2>September 2026</h2><div><div><div>Date</div><div>Description</div><div>Amount</div></div>
      <div><div>SEP 22</div><div>Purchase</div><div>− 12.00</div></div></div>
      <h2>August 2026</h2><div><div><div>Date</div><div>Description</div><div>Amount</div></div>
      <div><div>AUG 31</div><div>Deposit</div><div>10.00</div></div></div>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-22', amount: -12 },
      { date: '2026-08-31', amount: 10 },
    ]);
  });

  it('ignores summary rows with amounts beside real transactions', () => {
    document.body.innerHTML = table(`
      <tr><td>Total</td><td>Transactions</td><td>12.00</td></tr>
      <tr><td>SEP 22</td><td>Purchase</td><td>− 12.00</td></tr>
      <tr><td>Available balance</td><td>Checking</td><td>500.00</td></tr>`);
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-22', description: 'Purchase', amount: -12 },
    ]);
  });

  it('marks a checking row pending when the date cell contains a pending status', () => {
    document.body.innerHTML = table(`
      <tr><td><span>SEP 22</span><span style="display:none">September 22 2026</span> Pending</td>
      <td>Purchase</td><td>− 12.00</td></tr>`);
    expect(parseVisibleAccesDTransactions()[0]).toMatchObject({
      date: '2026-09-22', amount: -12, category: 'Pending transaction',
    });
  });

  it('reads dates with a weekday prefix', () => {
    document.body.innerHTML = table('<tr><td>Tue, SEP 22</td><td>Purchase</td><td>− 12.00</td></tr>');
    expect(parseVisibleAccesDTransactions()[0].date).toBe('2026-09-22');
  });

  it('reads numeric dates only when the visible month heading resolves their order', () => {
    document.body.innerHTML = table('<tr><td>09/22/2026</td><td>Purchase</td><td>− 12.00</td></tr>');
    expect(parseVisibleAccesDTransactions()[0].date).toBe('2026-09-22');
  });

  it('finds dated rows inside a div wrapper beside the header', () => {
    document.body.innerHTML = `
      <h2>September 2026</h2><div>
        <div><div>Date</div><div>Description</div><div>Amount</div></div>
        <div class="rows">
          <div><div>SEP 22</div><div>Purchase</div><div>− 12.00</div></div>
          <div><div>Total</div><div>Transactions</div><div>12.00</div></div>
        </div>
      </div>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-22', description: 'Purchase', amount: -12 },
    ]);
  });

  it('reads a row with a separate icon cell and amount in the final cell', () => {
    document.body.innerHTML = table(`
      <tr><td>SEP 22</td><td aria-hidden="true"></td><td>Purchase</td><td>− 12.00</td></tr>`);
    expect(parseVisibleAccesDTransactions()[0]).toMatchObject({ date: '2026-09-22', description: 'Purchase', amount: -12 });
  });

  it('stops on a date label it cannot interpret', () => {
    document.body.innerHTML = table('<tr><td>Today</td><td>Purchase</td><td>12.00</td></tr>');
    expect(() => parseVisibleAccesDTransactions()).toThrow('No CSV was created.');
  });

  it('requires a transaction table and a month heading', () => {
    document.body.innerHTML = '<h2>Account balance</h2><p>$10,000</p>';
    expect(() => parseVisibleAccesDTransactions()).toThrow('transaction table');
    document.body.innerHTML = '<h2>Balance</h2>' + table('<tr><td>SEP 22</td><td>Purchase</td><td>12.00</td></tr>').replace('<h2>September 2026</h2>', '');
    expect(() => parseVisibleAccesDTransactions()).toThrow('month and year');
  });
});

describe('AccèsD visible credit-card transactions', () => {
  it('flags pending authorizations and exports billed purchases, credits, and payments', () => {
    document.body.innerHTML = `
      <h2>Transactions par mois</h2>
      <h3>Autorisées non facturées <button aria-label="Information">i</button></h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th></th></tr></thead>
      <tbody>
        <tr><td>13 SEP 13 septembre</td><td>Pending example</td><td>0,00 $</td><td></td></tr>
        <tr><td>Total</td><td></td><td>0,00 $</td><td></td></tr>
      </tbody></table>
      <h3>Facturées en septembre 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Remises</th><th>Montant</th><th></th></tr></thead>
      <tbody>
        <tr><td>14 SEP 14 septembre</td><td><div>Loisirs - Autre</div><div>Example store</div></td><td>0,5 %</td><td>89,65 $</td><td></td></tr>
        <tr><td>10 SEP 10 septembre</td><td>Refund</td><td></td><td>+16,09 $</td><td></td></tr>
        <tr><td>10 SEP 10 septembre</td><td>Second refund</td><td></td><td>+32,18 $</td><td></td></tr>
        <tr><td>Total</td><td></td><td></td><td>41,38 $</td><td></td></tr>
      </tbody></table>
      <h3>Facturées en août 2026</h3><p>Aucune transaction</p>
      <h3>Facturées en juillet 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th></th></tr></thead>
      <tbody>
        <tr><td>13 JUL 13 juillet</td><td>Paiement</td><td>+24,95 $</td><td></td></tr>
        <tr><td>Total</td><td></td><td>+24,95 $</td><td></td></tr>
      </tbody></table>`;
    const transactions = parseVisibleAccesDTransactions();
    expect(transactions).toMatchObject([
      { date: '2026-09-13', category: 'Pending authorization', description: 'Pending example', amount: 0 },
      { date: '2026-09-14', category: 'Loisirs - Autre', description: 'Example store', amount: -89.65 },
      { date: '2026-09-10', description: 'Refund', amount: 16.09 },
      { date: '2026-09-10', description: 'Second refund', amount: 32.18 },
      { date: '2026-07-13', description: 'Paiement', amount: 24.95 },
    ]);
    const csv = generateCSV(transactions);
    expect(csv).toContain('2026-09-13,Pending example,Pending authorization,,0.00');
    expect(csv).toContain('2026-09-14,Example store,Loisirs - Autre,89.65,');
    expect(csv).toContain('2026-09-10,Refund,,,16.09');
    expect(csv).toContain('2026-09-10,Second refund,,,32.18');
    expect(csv).toContain('2026-07-13,Paiement,,,24.95');
  });

  it('reads English "Posted in <month> <year>" headings and Mon DD dates', () => {
    document.body.innerHTML = `
      <h2>Transactions by month</h2>
      <h3>Posted in November 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
      <tbody>
        <tr><td>Nov 16 <span class="sr-only">November 16</span></td><td><div>Medical care</div><div>Example clinic</div></td><td>$1,234.50</td><td></td></tr>
        <tr><td>Nov 13</td><td>Payment - Thank You</td><td>+$300.00</td><td></td></tr>
        <tr><td>Total</td><td></td><td>$934.50</td><td></td></tr>
      </tbody></table>
      <h3>Posted in October 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
      <tbody><tr><td>Oct 22</td><td>Example store</td><td>$20.00</td><td></td></tr></tbody></table>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-11-16', category: 'Medical care', description: 'Example clinic', amount: -1234.5 },
      { date: '2026-11-13', description: 'Payment - Thank You', amount: 300 },
      { date: '2026-10-22', description: 'Example store', amount: -20 },
    ]);
  });

  it('handles French and English headings in the same page', () => {
    document.body.innerHTML = `
      <h3>Authorized, not yet billed</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
      <tbody><tr><td>Nov 17</td><td>Pending example</td><td>$5.00</td><td></td></tr></tbody></table>
      <h3>Posted in November 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr></thead>
      <tbody><tr><td>Nov 16</td><td>English example</td><td>$10.00</td><td></td></tr></tbody></table>
      <h3>Facturées en octobre 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th></th></tr></thead>
      <tbody><tr><td>22 OCT 22 octobre</td><td>Exemple français</td><td>20,00 $</td><td></td></tr></tbody></table>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-11-17', category: 'Pending authorization', amount: -5 },
      { date: '2026-11-16', description: 'English example', amount: -10 },
      { date: '2026-10-22', description: 'Exemple français', amount: -20 },
    ]);
  });

  it('finds billed headings in bold text and section containers after pending rows', () => {
    document.body.innerHTML = `
      <div><div>Autorisées non facturées <button>i</button></div>
        <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
        <tbody><tr><td>13 SEP 13 septembre</td><td>Pending</td><td>0,00 $</td></tr></tbody></table>
      </div>
      <div><strong>Facturées en septembre 2026</strong>
        <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
        <tbody><tr><td>14 SEP 14 septembre</td><td>Example purchase</td><td>12,34 $</td></tr></tbody></table>
      </div>
      <section>Facturées en juillet 2026
        <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
        <tbody><tr><td>13 JUL 13 juillet</td><td>Example payment</td><td>+24,95 $</td></tr></tbody></table>
      </section>`;
    expect(parseVisibleAccesDTransactions()).toMatchObject([
      { date: '2026-09-13', description: 'Pending', category: 'Pending authorization', amount: 0 },
      { date: '2026-09-14', description: 'Example purchase', amount: -12.34 },
      { date: '2026-07-13', description: 'Example payment', amount: 24.95 },
    ]);
  });

  it('uses credit-card charge signs for pending amounts and keeps the pending Memo flag', () => {
    document.body.innerHTML = `
      <h3>Autorisées non facturées</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody>
        <tr><td>13 SEP</td><td><div>Shops</div><div>Pending purchase</div></td><td>9,99 $</td></tr>
        <tr><td>12 SEP</td><td>Pending credit</td><td>+2,00 $</td></tr>
      </tbody></table>
      <h3>Facturées en septembre 2026</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody><tr><td>10 SEP</td><td>Posted purchase</td><td>3,00 $</td></tr></tbody></table>`;
    const transactions = parseVisibleAccesDTransactions();
    expect(transactions).toMatchObject([
      { date: '2026-09-13', description: 'Pending purchase',
        category: 'Pending authorization | Shops', amount: -9.99 },
      { date: '2026-09-12', description: 'Pending credit',
        category: 'Pending authorization', amount: 2 },
      { date: '2026-09-10', description: 'Posted purchase', amount: -3 },
    ]);
    const csv = generateCSV(transactions);
    expect(csv).toContain('2026-09-13,Pending purchase,Pending authorization | Shops,9.99,');
    expect(csv).toContain('2026-09-12,Pending credit,Pending authorization,,2.00');
  });

  it('refuses to guess a year for pending authorizations without a matching billed month', () => {
    document.body.innerHTML = `
      <h3>Autorisées non facturées</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th></th></tr></thead>
      <tbody><tr><td>13 SEP 13 septembre</td><td>Pending example</td><td>0,00 $</td><td></td></tr></tbody></table>
      <h3>Facturées en août 2026</h3>`;
    try {
      parseVisibleAccesDTransactions();
      throw new Error('Expected an AccèsD parse error');
    } catch (error) {
      expect(error).toBeInstanceOf(AccesDParseError);
      const diagnostic = (error as AccesDParseError).diagnostic;
      expect(diagnostic).toContain('AccèsD parser diagnostic v3');
      expect(diagnostic).toContain('reason=pending-year');
      expect(diagnostic).not.toContain('Pending example');
    }
  });

  it('refuses ambiguous years when two billed sections have the same month', () => {
    document.body.innerHTML = `
      <h3>Autorisées non facturées</h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
      <tbody><tr><td>13 SEP</td><td>Pending</td><td>0,00 $</td></tr></tbody></table>
      <h3>Facturées en septembre 2025</h3>
      <h3>Facturées en septembre 2026</h3>`;
    expect(() => parseVisibleAccesDTransactions()).toThrow('unique year');
  });
});

describe('AccèsD amount parsing', () => {
  it('handles debit signs and English/French decimal separators', () => {
    expect(parseAccesDAmount('− 1,234.56 $')).toBe(-1234.56);
    expect(parseAccesDAmount('(1 234,56 $)')).toBe(-1234.56);
    expect(parseAccesDAmount('+ 42,05 $')).toBe(42.05);
    expect(parseAccesDAmount('not an amount')).toBeNull();
    expect(parseAccesDAmount('1,234.567')).toBeNull();
  });
});
