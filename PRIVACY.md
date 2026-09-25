# Privacy Policy

**Effective Date:** February 14, 2026

I built this extension to let you export your Wealthsimple transactions locally. It's open-source and runs entirely in your browser — I don't have access to your data and nothing is sent to a server I control.

### 1. Data Collection
I do not receive or store your personal or financial data on a server. The extension does not upload exported files, transaction data, or browsing data to external servers. It stores export preferences and last-export metadata locally in your browser.

### 2. Local Processing Only
All processing (fetching activity with your active session, normalizing transactions, and generating CSV/OFX/QFX files) happens in your browser. Exported files are created on your device (for example, in your Downloads folder).

### 3. Third-Party Access
Your data stays on your device. I do not include telemetry, analytics, or third-party tracking in the extension.

### 4. Authentication
The extension reads your active Wealthsimple session cookie only when you click **Get Token**. It keeps a copy of the access token in browser session storage to make Wealthsimple API requests for exports. The status label shows whether that copy is stored. **Flush Token** removes the copy, and browser session storage clears when the browser closes. The extension does not ask for your username, password, or MFA/TOTP secret. Flushing the copy does not sign you out of Wealthsimple.

### 5. Open Source
The code is public so anyone can inspect how the extension works: https://github.com/nicksalt/wealthsimple-exporter

### 6. Changes to This Policy
I may update this policy from time to time. If I make material changes, I will update the effective date and note the change in the repository.

### 7. Contact
If you have questions or privacy concerns, please open an issue on the project repository.

Security & usage notes

- Keep your browser and extensions up to date.
- If you share your computer or browser profile, be aware that exported files are created locally and may be accessible by other users of the device.
- The extension only has access to data available to the browser while you're logged into Wealthsimple.

— Nick
