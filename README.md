# Wealthsimple Exporter (Unofficial)

> **Disclaimer:** This project is an unofficial browser extension. It is not affiliated with, maintained, authorized, or endorsed by Wealthsimple Technologies Inc. or any of its affiliates. Use at your own risk.

A privacy-focused browser extension for exporting Wealthsimple transactions to CSV, OFX, and QFX. Designed for users of Actual Budget, YNAB, and Quicken who need more granular export options than native monthly statements.

Inspired in part by [ws-api-python](https://github.com/gboudreau/ws-api-python), an unofficial Python API for Wealthsimple.

---

## ✨ Features

- **Direct UI Integration**: Adds an "Export Transactions" button directly to the Wealthsimple sidebar.
- **Multiple Formats**: Export as **CSV**, **OFX**, or **QFX** seamlessly.
- **YNAB Optimized**: CSV output is pre-formatted to match YNAB's import requirements.
- **Incremental Syncing**: Tracks `lastTransactionId` to help prevent duplicate imports into your budget.
- **Privacy First**: Local processing with zero telemetry. Your Wealthsimple access token is loaded only when you click **Get Token** and is held for the current browser session.

## 📊 Account Coverage

| Account Type | Validation Status |
| :--- | :--- |
| **Cash** | High Confidence ✅ |
| **Credit Card** | High Confidence ✅ |
| **TFSA/RRSP (Self-directed)** | Partial Confidence ⚠️ |
| **Other Variants** | Community Validation Needed 🔍 |

*If you encounter an unsupported transaction or account variant, please open an issue with a redacted payload sample.*

## 🔒 Privacy & Security

The extension uses a strictly local-first architecture:

- **Authentication**: Click **Get Token** in the popup or page export panel while signed in to Wealthsimple. The extension reads the session cookie only on that click, keeps its access token in browser session storage, and never asks for your password or MFA code. Click **Flush Token** when finished; closing the browser also clears the stored copy.
- **Data Handling**: All fetching and file generation happens entirely within your browser. No data is sent to external servers.
- **Transparency**: Core logic is located in `src/background/transactionService.ts` for easy auditing.
- **Zero Telemetry**: No analytics, tracking, or "home-phoning" is included.

The status label shows whether the extension currently holds a token. Export is disabled until you click **Get Token**. **Flush Token** removes the extension's copy; it does not sign you out of Wealthsimple or invalidate Wealthsimple's own session.

## 🚀 Getting Started

### Prerequisites
- Google Chrome or a Chromium-based browser (Brave, Edge, etc.)
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
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `dist` folder.

### Testing (Optional)
This project uses Playwright for E2E testing. To run tests:
- Set up a `.env` file with your test credentials (see `CONTRIBUTING.md`).
- **Never** commit this `.env` file.
- Run `npx playwright test`.

## 🤝 Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` before opening a Pull Request. For behavior gaps or bugs, please include redacted payload samples in your issue reports.

---

*Wealthsimple Exporter is an independent open-source project.*
