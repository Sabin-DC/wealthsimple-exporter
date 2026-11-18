# Wealthsimple & AccèsD Exporter (Unofficial)

> **Disclaimer:** This project is an unofficial browser extension. It is not affiliated with, maintained, authorized, or endorsed by Wealthsimple Technologies Inc., Desjardins Group, or their affiliates. Use at your own risk.

A privacy-focused browser extension for exporting Wealthsimple transactions to CSV, OFX, and QFX, and visible AccèsD checking and credit card transactions to CSV. Designed for users of Actual Budget, YNAB, and Quicken who need more granular export options than native monthly statements.

Inspired in part by [ws-api-python](https://github.com/gboudreau/ws-api-python), an unofficial Python API for Wealthsimple.

---

## ✨ Features

- **Direct UI Integration**: Adds an "Export Transactions" button directly to the Wealthsimple sidebar.
- **Multiple Formats**: Export as **CSV**, **CSV (signed amounts)**, **OFX**, or **QFX**.
- **YNAB Optimized**: The default CSV uses YNAB's `Outflow`/`Inflow` columns.
- **Signed CSV**: For tools that want one `Amount` column (negative = outflow), such as Pocketsmith or MS Money.
- **Credit Card OFX**: Credit card accounts export as proper OFX credit card statements.
- **Incremental Syncing**: Tracks `lastTransactionId` to help prevent duplicate imports into your budget.
- **AccèsD Visible CSV**: Export checking, billed credit card, and dated pending rows currently rendered in your selected AccèsD view, including current-month activity. Use the page button or extension popup. This does not read or store an AccèsD token.
- **Privacy First**: Local processing with zero telemetry. Your Wealthsimple access token is loaded only when you click **Get Token** and is held for the current browser session.

## 📊 Account Coverage

| Account Type | Validation Status |
| :--- | :--- |
| **Cash** | High Confidence ✅ |
| **Credit Card** | High Confidence ✅ |
| **TFSA/RRSP (Self-directed)** | Partial Confidence ⚠️ |
| **Other Variants** | Community Validation Needed 🔍 |

*If you encounter an unsupported transaction or account variant, please open an issue with a redacted payload sample.*

## 📁 Choosing a Format

| Format | Best for | Notes |
| :--- | :--- | :--- |
| **CSV** | YNAB, Actual Budget | `Date, Payee, Memo, Outflow, Inflow`. Investment accounts use a trading layout with a signed `Amount`. |
| **CSV (signed amounts)** | Pocketsmith, MS Money, spreadsheets | `Date, Payee, Memo, Amount`, with negative amounts for outflows. |
| **OFX** | Pocketsmith, GnuCash, Actual Budget, most OFX importers | Credit card accounts use the OFX credit card statement format. |
| **QFX** | Quicken (see below) | OFX plus an Intuit `INTU.BID`. |

### Quicken and QFX

Quicken only accepts QFX files from institutions registered with Intuit, and Wealthsimple isn't registered. Quicken may therefore reject the file with "unable to verify the financial institution". The extension doesn't put another bank's ID in the file to get around this, because that misrepresents where the file came from. If Quicken rejects the QFX, export **CSV (signed amounts)** and use Quicken's CSV import instead, where your Quicken version supports it.

## 🔒 Privacy & Security

The extension uses a strictly local-first architecture:

- **Authentication**: Click **Get Token** in the popup or page export panel while signed in to Wealthsimple. The extension reads the session cookie only on that click, keeps its access token in browser session storage, and never asks for your password or MFA code. Click **Flush Token** when finished; closing the browser also clears the stored copy.
- **Data Handling**: Wealthsimple requests go only to Wealthsimple. AccèsD export reads the transaction rows already rendered in the active browser tab; it makes no AccèsD API requests and stores no AccèsD token. File generation happens in your browser. No transaction data is sent to the project or a third-party service.
- **Transparency**: Core logic is located in `src/background/transactionService.ts` for easy auditing.
- **Zero Telemetry**: No analytics, tracking, or "home-phoning" is included.

The Wealthsimple status label shows whether the extension currently holds a Wealthsimple token. Export is disabled until you click **Get Token**. **Flush Token** removes the extension's copy; it does not sign you out of Wealthsimple or invalidate Wealthsimple's own session.


### AccèsD checking and credit card export

1. Sign in to personal AccèsD and open a checking account or credit card transaction view. Select the account, month, and any available filters.
2. Click **Export visible AccèsD CSV** on the page or in the extension popup. The extension exports transaction rows currently rendered for that view to your Downloads folder, using the same `Date,Payee,Memo,Outflow,Inflow` CSV columns as the Wealthsimple budgeting export.

The AccèsD export includes loaded rows in the displayed transaction sections for the selected account, including multiple visible month sections and rows below the scroll position. It does not fetch other pages, closed months, or transactions hidden behind a **Load more** control. Checking rows require a visible month/year heading. Billed credit card rows use headings such as **Facturées en septembre 2026**. Credit card rows under **Autorisées non facturées** are included with **Pending authorization** in the Memo column when a matching billed month gives them an unambiguous year. Checking rows in a pending section or with **Pending**/**En attente** in the date label are included with **Pending transaction** in Memo. A separate checking pending section needs a matching checking month/year heading; checking amount signs are preserved. If a pending row's year or account type cannot be resolved, export stops without creating a partial CSV. The parser ignores totals, balances, credit card reward percentages (Remises), and action cells. An unsigned credit card amount is exported as an outflow; an amount with a leading **+** is exported as an inflow. Pending amounts retain their displayed magnitude, including zero amounts that may change when posted. French abbreviated dates and matching duplicate date labels are supported. If AccèsD changes its page markup, the export stops with an error instead of guessing. On a parse error, the popup offers a copyable diagnostic with only row structure and masked date/amount patterns; it contains no merchant names or raw amounts and is never uploaded by the extension. Check the CSV before importing it. Credit card layout support is based on the shown page structure and still needs a live retest.

The AccèsD content script is limited to `https://accesdc.mouv.desjardins.com/*` and `https://accesd.mouv.desjardins.com/*` so it can read the displayed rows. AccèsD is not in `host_permissions`, and the extension does not use the cookies API for AccèsD. The `scripting` permission lets the popup load the bundled AccèsD script into an already-open tab only after you click export and the normal page connection fails; `activeTab` limits that fallback to the invoked tab. Browser permission prompts may still list the content-script site.

## 🚀 Getting Started

### Prerequisites
- Firefox 140 or newer (this branch targets Firefox with Manifest V3)
- Node.js and npm

### Installation
1. **Clone the repo:**
   ```bash
   git clone https://github.com/nicksalt/wealthsimple-exporter.git
   ```
2. **Install dependencies:**
   ```bash
   cd wealthsimple-exporter && npm install
   ```
3. **Build the project:**
   ```bash
   npm run build
   ```
4. **Load in Browser:**
   - Open `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on...** and select `dist/manifest.json`.
   - Temporary add-ons are removed when Firefox restarts. Run `npm run zip` to package `dist/` for signing/submission on addons.mozilla.org.

### Testing (Optional)
This project uses Playwright for E2E testing. To run tests:
- Set up a `.env` file with your test credentials (see `CONTRIBUTING.md`).
- **Never** commit this `.env` file.
- Run `npx playwright test`.

## 🤝 Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` before opening a Pull Request. For behavior gaps or bugs, please include redacted payload samples in your issue reports.

---

*Wealthsimple Exporter is an independent open-source project.*
