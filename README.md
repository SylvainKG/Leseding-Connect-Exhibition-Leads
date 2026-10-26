# Leseding Connect — Exhibition Lead Capture

The exhibition contact form is a static page on **GitHub Pages**, and **Google Apps Script** saves the leads and analytics to **Google Sheets**. Everything runs on free tiers.

```
QR card ──► https://<user>.github.io/<repo>/?member=sylvain   (GitHub Pages: docs/)
                    │  page loads → GET  ?action=visit  → logs visit, returns signed token
                    │  submit     → POST {action:submit, token, …}
                    ▼
            Apps Script /exec  ──►  Google Sheet: Leads · Events · Team · Dashboard
```

| Folder | What it is |
|---|---|
| `docs/` | The website. GitHub Pages serves this folder. **`docs/config.js` is the only file you edit to rebrand.** |
| `apps-script/` | `Code.gs` and `appsscript.json`, pasted into the sheet's Apps Script project |
| `tools/make_qr.py` | Creates the 3 print-ready QR codes |

---

## 1. Set up the Google Sheet and backend (about 10 minutes)

1. Use the Google account that will own the data. A shared BlueApps or Leseding account is better than a personal one. Create a new Google Sheet named **Leseding AI Engine — Exhibition Leads & Analytics**.
2. Open **Extensions → Apps Script**.
3. In the left sidebar, click ⚙ **Project Settings**, then tick **Show "appsscript.json" manifest file in editor**.
4. Back in the **Editor**, replace the contents of `Code.gs` with `apps-script/Code.gs`, and the contents of `appsscript.json` with `apps-script/appsscript.json`. Save.
5. Select the `setup` function in the toolbar and click **Run**. Approve the permissions. The script asks for only two:
   - *See, edit… only the spreadsheet this script is installed in*
   - *Display and run third-party web content in prompts and sidebars* (this one is just the admin menu)

   No Gmail, Drive or notification access is requested.
6. Reload the sheet. You should now see the **Leseding Admin** menu and the tabs `Dashboard`, `Leads`, `Events` and `Team`.
7. Click **Deploy → New deployment**, choose type **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy** and copy the **Web app URL**, which ends in `/exec`.
8. Paste that URL into `apiUrl` in `docs/config.js`.

> **Updating code later:** use **Deploy → Manage deployments → ✏ Edit → Version: New version**. This keeps the same `/exec` URL. If you choose *New deployment* instead, you get a new URL.

## 2. Publish the form on GitHub Pages

1. Create a GitHub repository, for example `leseding-connect` (public is fine), and push this whole folder to it.
2. Go to **Settings → Pages → Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, and Folder to **/docs**.
3. After about a minute the site is live at `https://<github-username>.github.io/leseding-connect/`.
4. Test all 3 links on your phone:
   - `…/?member=sylvain`
   - `…/?member=gorata`
   - `…/?member=arabang`
   - `…/` with no member, which should show "The Leseding team" and be saved as *unattributed*

## 3. Add photos and branding

- **Photos:** add square JPGs, about 400×400 px and under 100 KB, as `docs/assets/team/sylvain.jpg`, `gorata.jpg` and `arabang.jpg`. Until a photo exists, the card shows the person's initials.
- **Logo, colours, font and wording:** edit `docs/config.js`. The current colours are **temporary placeholders**.
- **Names and roles:** update them in **both** `docs/config.js` (what visitors see) and the sheet's `Team` tab (used for attribution). The `id` values must match in both places. **Never change an `id` once cards are printed.**
- **Removing a member:** untick **Active** in the `Team` tab. Their links still open the form, but new leads from those links are saved as *unattributed*.

## 4. Generate the QR codes (after the Pages URL works)

```bash
pip install "qrcode[pil]"
python tools/make_qr.py https://<github-username>.github.io/leseding-connect/
```

This writes `qr/sylvain.svg`, `qr/gorata.svg`, `qr/arabang.svg` and PNG copies. Upload the **SVG** files to Canva so they stay sharp.
- Print each code **at least 2 cm wide**, black on white, and keep the white border around it.
- Don't recolour or place a logo over the code.
- Scan a printed proof of each card before ordering the full print run.

Because the QR codes point to GitHub Pages and not to Apps Script, you can redeploy or move the backend later by editing `apiUrl` only. The cards never need reprinting.

## 5. Before the exhibition: reset

In the sheet, open **Leseding Admin**:

| Menu item | What it does |
|---|---|
| **Reset: clear visits only (link previews / tests)** | Deletes every `visit` event. Leads and their submission events are kept. |
| **Reset: clear ALL leads & events (fresh start)** | Deletes all leads and all events. **Run this the morning of the exhibition**, after your final test. |
| **Set up / repair sheets** | Recreates any missing tab or header. It never deletes data. |
| **Rebuild dashboard** | Run this after adding or removing members in `Team`. |

Each reset asks you to type `RESET` to confirm. If someone resets by mistake, use **File → Version history** to restore the sheet.

## 6. During and after the exhibition

- **Leads tab:** the first 11 columns are filled automatically. The team fills in *Lead Priority*, *Follow-up Status* (dropdowns), *Assigned To*, *Next Action* and *Follow-up Date*.
- **Dashboard tab:** shows visits, submissions and conversion rate, in total and per member, plus tables by day and by hour. It updates automatically.
- **What counts as a visit:** a "Recorded visit" is a page load from a real, visible browser. Link-preview bots and prerendered pages usually aren't counted. Reloads are counted. It is **not** a count of unique people.
- **Booth tablet:** after a submission, tap **Add another contact** to collect the next visitor's details.
- **Removal requests:** if someone asks to be removed, delete their row in `Leads`.
- **Sharing access:** share the sheet only with Sylvain, Gorata and Arabang. Visitors never need access to it.

## Security notes

- The member is taken from a server-signed token (HMAC, valid for 24 h). Visitors cannot change it through the form. Unknown or inactive IDs are saved as `unattributed`.
- Every field is validated again on the server. Text that could act as a spreadsheet formula is neutralised, a hidden honeypot field catches bots, and each page load can submit at most 10 leads.
- Retries carry a submission ID, so a double tap or a network retry never creates duplicate leads.
- The success message appears only after the row has been written to the sheet.
- The `/exec` URL in `config.js` is public by design. The spreadsheet ID and the signing secret (stored in Script Properties) never reach the browser.
