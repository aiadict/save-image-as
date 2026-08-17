---
title: Privacy Policy (draft — for Chrome Web Store submission)
status: draft, needs legal review before publishing
updated: 2026-08-16
---

# Privacy Policy — Save Image As

_Last updated: [fill in at publish time]_

**Save Image As does not collect, transmit, sell, or share any of your data.**

## What the extension does

Save Image As lets you right-click an image on a web page and save it in a different format (JPG, PNG, WebP, AVIF), optionally to a folder and format you've chosen as your default. All image decoding and re-encoding happens **entirely on your device**, inside your browser. The image you save is never uploaded to any server we operate or any third party.

## Data we collect

**None.** Specifically, we do not collect:
- The images you view, click, or save
- The URLs or pages you visit
- Your browsing history
- Any personally identifiable information
- Any analytics tied to the content of pages you visit

## Data stored locally on your device

The extension stores a small set of **preferences**, locally in your browser (via Chrome's `storage` API, optionally synced across your own signed-in Chrome devices by Chrome itself — we never see this data):

- Your preferred save mode (ask where to save vs. quick save)
- Your default image format and default download sub-folder name
- Whether you've completed the first-run walkthrough

None of this leaves your device or is accessible to us.

## Permissions and why we need them

| Permission | What it's used for |
|---|---|
| `contextMenus` | Add "Save Image As" entries to the right-click menu |
| `downloads` | Save the converted file to your Downloads folder |
| `storage` | Remember your format/folder/save-mode preferences, locally |
| `scripting` / `activeTab` | Read the specific image you right-clicked, on the tab you're using, so it can be resolved to its real source |
| `notifications` | Tell you why a save failed, if it fails, instead of failing silently |
| Host permission for a specific site (automatic, best-effort) | Fetch the actual image bytes from that site when the browser's own security rules would otherwise block it |
| Host permission for all sites (optional — only if you click "Allow on all sites" in Settings) | The reliable alternative if the automatic per-site request above doesn't go through; entirely your choice, off by default |

We never request broad access to your browsing activity by default — "Allow on all sites" only ever runs because you clicked a button that says exactly that, and even then it's used only to read the bytes of an image you've asked us to convert, not to observe your browsing.

## No remote code

Every part of the extension that runs is packaged inside the extension itself and reviewed by the Chrome Web Store at each release. Nothing is fetched and executed from a remote server after installation.

## No ads, no affiliate links, no tracking

The extension does not display ads, inject affiliate links, or track you across sites.

## Changes to this policy

If this policy changes, the "Last updated" date above will change, and material changes will be reflected in the extension's release notes.

## Contact

[fill in support email / website before publishing]

---
_Note to self: this draft must be reviewed against the actual final permission set and any Phase 4 licensing/backend component before submission — a licensing check-in (Phase 4) does call a server and that data flow must be added here truthfully when it exists._
