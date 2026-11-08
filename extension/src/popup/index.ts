import {
  getPreferences,
  setPreferences,
  type DefaultFormat,
  type MenuStyle,
  type SaveMode,
  type SizeBudget,
} from "../lib/storage";
import { hasBroadImageAccess, requestBroadImageAccess } from "../lib/permissions";
import { getStats } from "../lib/stats";
import { quickSaveTitle } from "../lib/menu-spec";
import { WEBSITE_URL } from "../lib/config";
import { initRatingWidget } from "./rating-widget";

const SAVE_MODE_HELP: Record<SaveMode, string> = {
  ask: "Opens a save dialog so you can rename the file or pick another folder.",
  quick: "Saves straight into the folder below, no dialog.",
};

/**
 * A group of role="radio" buttons: marks the chosen one (aria-checked, plus
 * .active for the segmented style), keeps a single tab stop and moves with
 * the arrow keys, like a native radio group.
 */
function initRadioGroup(
  container: HTMLElement,
  key: string,
  initial: string,
  onChange: (value: string) => void
): void {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const select = (value: string, focus = false) => {
    for (const btn of buttons) {
      const on = btn.dataset[key] === value;
      btn.setAttribute("aria-checked", String(on));
      btn.classList.toggle("active", on);
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    }
  };
  select(initial);

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const value = btn.dataset[key]!;
      select(value);
      onChange(value);
    });
  }

  container.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
    const next = buttons[(current + step + buttons.length) % buttons.length]!;
    const value = next.dataset[key]!;
    select(value, true);
    onChange(value);
  });
}

async function init(): Promise<void> {
  const prefs = await getPreferences();

  const saveModeHelper = document.getElementById("saveModeHelper")!;
  const folderInput = document.getElementById("defaultFolder") as HTMLInputElement;
  const menuPreviewParent = document.getElementById("menuPreviewParent")!;
  const menuPreviewItem = document.getElementById("menuPreviewItem")!;
  const quickActionNote = document.getElementById("quickActionNote")!;
  const advToggle = document.getElementById("advToggle") as HTMLButtonElement;
  const advPanel = document.getElementById("advPanel") as HTMLDivElement;
  const qualitySlider = document.getElementById("jpgQuality") as HTMLInputElement;
  const qualityValue = document.getElementById("jpgQualityValue")!;
  const grantAccessBtn = document.getElementById("grantAccess") as HTMLButtonElement;
  const accessStatus = document.getElementById("accessStatus")!;
  const ledgerCount = document.getElementById("ledgerCount")!;
  const ledgerLabel = document.getElementById("ledgerLabel")!;
  const useDescriptiveFilenames = document.getElementById("useDescriptiveFilenames") as HTMLInputElement;
  const permissionBanner = document.getElementById("permissionBanner") as HTMLElement;
  const permissionBannerBody = document.getElementById("permissionBannerBody")!;
  const bannerGrantBtn = document.getElementById("bannerGrantBtn") as HTMLButtonElement;
  const bannerDismissBtn = document.getElementById("bannerDismissBtn") as HTMLButtonElement;

  document.getElementById("helpBtn")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: WEBSITE_URL });
  });

  // --- Right-click menu preview (what the one-click item will say) ---
  let defaultFormat = prefs.defaultFormat;
  let defaultFolder = prefs.defaultFolder;
  let menuStyle = prefs.menuStyle;
  const updateMenuPreview = () => {
    menuPreviewItem.textContent = `⚡ ${quickSaveTitle({ defaultFormat, defaultFolder })}`;
    menuPreviewParent.hidden = menuStyle === "oneClick";
    if (menuStyle === "oneClick") {
      quickActionNote.textContent =
        "One-click only: this is the only item in your right-click menu. Switch to Full menu under More options for other formats.";
      quickActionNote.classList.add("visible");
    } else {
      quickActionNote.classList.remove("visible");
    }
  };
  updateMenuPreview();

  // --- One-click format ---
  initRadioGroup(document.getElementById("formatTiles")!, "format", defaultFormat, (value) => {
    defaultFormat = value as DefaultFormat;
    updateMenuPreview();
    void setPreferences({ defaultFormat });
  });

  // --- Save mode ---
  saveModeHelper.textContent = SAVE_MODE_HELP[prefs.saveMode];
  initRadioGroup(document.getElementById("saveModeSeg")!, "mode", prefs.saveMode, (value) => {
    const mode = value as SaveMode;
    saveModeHelper.textContent = SAVE_MODE_HELP[mode];
    void setPreferences({ saveMode: mode });
  });

  // --- Folder ---
  folderInput.value = prefs.defaultFolder;
  folderInput.addEventListener("input", () => {
    defaultFolder = folderInput.value.trim() || "SaveImageAs";
    updateMenuPreview();
  });
  folderInput.addEventListener("change", () => {
    defaultFolder = folderInput.value.trim() || "SaveImageAs";
    void setPreferences({ defaultFolder });
  });

  // --- More options disclosure ---
  advToggle.addEventListener("click", () => {
    const expanded = advToggle.getAttribute("aria-expanded") === "true";
    advToggle.setAttribute("aria-expanded", String(!expanded));
    advPanel.hidden = expanded;
  });

  // --- Right-click menu style ---
  initRadioGroup(document.getElementById("menuStyleSeg")!, "menuStyle", menuStyle, (value) => {
    menuStyle = value as MenuStyle;
    updateMenuPreview();
    void setPreferences({ menuStyle });
  });

  // --- JPG quality ---
  qualitySlider.value = String(prefs.jpgQuality);
  qualityValue.textContent = `${Math.round(prefs.jpgQuality * 100)}%`;
  qualitySlider.addEventListener("input", () => {
    qualityValue.textContent = `${Math.round(Number(qualitySlider.value) * 100)}%`;
  });
  qualitySlider.addEventListener("change", () => {
    void setPreferences({ jpgQuality: Number(qualitySlider.value) });
  });

  // --- Compressed target size ---
  initRadioGroup(document.getElementById("sizeBudgetSeg")!, "budget", prefs.sizeBudget, (value) => {
    void setPreferences({ sizeBudget: value as SizeBudget });
  });

  // --- Smart (descriptive) filenames ---
  useDescriptiveFilenames.checked = prefs.useDescriptiveFilenames;
  useDescriptiveFilenames.addEventListener("change", () => {
    void setPreferences({ useDescriptiveFilenames: useDescriptiveFilenames.checked });
  });

  // --- Trust ledger ---
  // See docs/architecture.md "Trust ledger" for the exact wording rules this
  // must satisfy — it has to stay literally true, not just reassuring.
  const stats = await getStats();
  if (stats.imagesSavedCount > 0) {
    ledgerCount.textContent = stats.imagesSavedCount.toLocaleString();
    ledgerLabel.textContent = `image${stats.imagesSavedCount === 1 ? "" : "s"} saved on this device`;
  } else {
    ledgerCount.textContent = "Ready when you are";
    ledgerCount.classList.add("is-empty");
    ledgerLabel.textContent = "Right-click any image on any page.";
  }

  // --- Site access ---
  const refreshAccessStatus = async () => {
    const granted = await hasBroadImageAccess();
    accessStatus.textContent = granted ? "Granted: images on any site can be converted." : "Not granted yet.";
    accessStatus.classList.toggle("granted", granted);
    grantAccessBtn.disabled = granted;
    return granted;
  };
  void refreshAccessStatus();

  const hideBanner = () => {
    permissionBanner.hidden = true;
  };

  const dismissBanner = () => {
    void setPreferences({ lastSaveBlockedByPermission: false, lastBlockedOrigin: "" });
    hideBanner();
  };

  // Shared by both the More-options button and the reactive banner's
  // button below — each caller invokes this as the FIRST statement of its
  // own click handler, so the synchronous user gesture chrome.permissions
  // .request() needs stays intact regardless of which button was clicked.
  const grantBroadAccess = () => {
    void requestBroadImageAccess().then((granted) => {
      void refreshAccessStatus();
      if (granted) {
        dismissBanner();
      } else {
        accessStatus.textContent = "Permission wasn't granted.";
      }
    });
  };

  grantAccessBtn.addEventListener("click", grantBroadAccess);
  bannerGrantBtn.addEventListener("click", grantBroadAccess);
  bannerDismissBtn.addEventListener("click", dismissBanner);

  // --- Reactive permission banner ---
  // Only shown to someone who just actually hit a permission-blocked save —
  // never by default. See docs/architecture.md "Reactive permission prompt".
  if (prefs.lastSaveBlockedByPermission) {
    const alreadyGranted = await refreshAccessStatus();
    if (alreadyGranted) {
      // Resolved some other way (e.g. granted from a previous popup open) — clean up quietly.
      void setPreferences({ lastSaveBlockedByPermission: false, lastBlockedOrigin: "" });
    } else {
      permissionBannerBody.textContent = prefs.lastBlockedOrigin
        ? `A recent save on ${prefs.lastBlockedOrigin} was blocked by the site's own permissions. Allow Save Image As on all sites to fix it.`
        : "A recent save was blocked by site permissions. Allow Save Image As on all sites to fix it.";
      permissionBanner.hidden = false;
    }
  }
}

void init();
initRatingWidget();
