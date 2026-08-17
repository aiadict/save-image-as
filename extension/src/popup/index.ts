import { getPreferences, setPreferences, type DefaultFormat, type SaveMode } from "../lib/storage";
import { hasBroadImageAccess, requestBroadImageAccess } from "../lib/permissions";
import { initRatingWidget } from "./rating-widget";

const SAVE_MODE_HELP: Record<SaveMode, string> = {
  ask: "Opens a save dialog so you can rename the file and choose a folder.",
  quick: "Saves instantly using your default format and folder below.",
};

async function init(): Promise<void> {
  const prefs = await getPreferences();

  const segButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#saveModeSeg button"));
  const saveModeHelper = document.getElementById("saveModeHelper")!;
  const formatSelect = document.getElementById("defaultFormat") as HTMLSelectElement;
  const folderInput = document.getElementById("defaultFolder") as HTMLInputElement;
  const quickActionNote = document.getElementById("quickActionNote")!;
  const advToggle = document.getElementById("advToggle") as HTMLButtonElement;
  const advPanel = document.getElementById("advPanel") as HTMLDivElement;
  const qualitySlider = document.getElementById("jpgQuality") as HTMLInputElement;
  const qualityValue = document.getElementById("jpgQualityValue")!;
  const grantAccessBtn = document.getElementById("grantAccess") as HTMLButtonElement;
  const accessStatus = document.getElementById("accessStatus")!;
  const permissionBanner = document.getElementById("permissionBanner") as HTMLElement;
  const permissionBannerBody = document.getElementById("permissionBannerBody")!;
  const bannerGrantBtn = document.getElementById("bannerGrantBtn") as HTMLButtonElement;
  const bannerDismissBtn = document.getElementById("bannerDismissBtn") as HTMLButtonElement;

  // --- Save mode ---
  const setActiveSegment = (mode: SaveMode) => {
    segButtons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-checked", String(active));
    });
    saveModeHelper.textContent = SAVE_MODE_HELP[mode];
  };
  setActiveSegment(prefs.saveMode);
  segButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode as SaveMode;
      setActiveSegment(mode);
      void setPreferences({ saveMode: mode });
    });
  });

  // --- Default format + folder (drives the one-click context-menu item) ---
  const updateQuickActionNote = () => {
    if (formatSelect.value === "original") {
      quickActionNote.textContent =
        "\"Original\" has nothing to convert to, so the one-click item won't appear — use the Save Image As submenu instead.";
      quickActionNote.classList.add("visible");
    } else {
      quickActionNote.classList.remove("visible");
    }
  };

  formatSelect.value = prefs.defaultFormat;
  folderInput.value = prefs.defaultFolder;
  updateQuickActionNote();

  formatSelect.addEventListener("change", () => {
    void setPreferences({ defaultFormat: formatSelect.value as DefaultFormat });
    updateQuickActionNote();
  });

  folderInput.addEventListener("change", () => {
    void setPreferences({ defaultFolder: folderInput.value.trim() || "SaveImageAs" });
  });

  // --- Advanced disclosure ---
  advToggle.addEventListener("click", () => {
    const expanded = advToggle.getAttribute("aria-expanded") === "true";
    advToggle.setAttribute("aria-expanded", String(!expanded));
    advPanel.hidden = expanded;
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

  // --- Site access ---
  const refreshAccessStatus = async () => {
    const granted = await hasBroadImageAccess();
    accessStatus.textContent = granted ? "Granted — images on any site can be converted." : "Not granted yet.";
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

  // Shared by both the Advanced-section button and the reactive banner's
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
