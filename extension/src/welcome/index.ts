// First-run welcome tab: three steps that tick themselves off.
//   1. Pin: polls chrome.action.getUserSettings() (and listens to
//      onUserSettingsChanged where Chrome has it, 130+).
//   2. Format: the same defaultFormat preference the popup sets.
//   3. Save: watches the on-device save count; the first increase while this
//      tab is open means the sample photo (or anything else) was saved.
// See docs/redesign-plan.md Phase 4.1.

import { getPreferences, setPreferences, type DefaultFormat } from "../lib/storage";
import { quickSaveTitle } from "../lib/menu-spec";
import { getStats } from "../lib/stats";

type StepState = "waiting" | "active" | "done";

const stepPin = document.getElementById("stepPin")!;
const stepFormat = document.getElementById("stepFormat")!;
const stepSave = document.getElementById("stepSave")!;

const state = { pinned: false, formatChosen: false, saved: false };

function render(): void {
  const current = !state.pinned ? 1 : !state.formatChosen ? 2 : !state.saved ? 3 : 4;
  const stateOf = (n: number, done: boolean): StepState => (done ? "done" : n === current ? "active" : "waiting");
  stepPin.dataset.state = stateOf(1, state.pinned);
  stepFormat.dataset.state = stateOf(2, state.formatChosen);
  stepSave.dataset.state = stateOf(3, state.saved);
}

async function init(): Promise<void> {
  void setPreferences({ hasCompletedOnboarding: true });
  const prefs = await getPreferences();

  // --- Step 2: format ---
  const pills = Array.from(document.querySelectorAll<HTMLButtonElement>("#formatPills button"));
  const menuLabels = [document.getElementById("menuLabel")!, document.getElementById("menuLabel2")!];
  let folder = prefs.defaultFolder;
  const showFormat = (format: DefaultFormat) => {
    for (const pill of pills) {
      const on = pill.dataset.format === format;
      pill.setAttribute("aria-checked", String(on));
      pill.tabIndex = on ? 0 : -1;
    }
    const title = quickSaveTitle({ defaultFormat: format, defaultFolder: folder });
    for (const el of menuLabels) el.textContent = title;
  };
  showFormat(prefs.defaultFormat);
  for (const pill of pills) {
    pill.addEventListener("click", () => {
      const format = pill.dataset.format as DefaultFormat;
      showFormat(format);
      state.formatChosen = true;
      render();
      void setPreferences({ defaultFormat: format });
    });
  }
  document.getElementById("formatPills")!.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = pills.findIndex((p) => p.getAttribute("aria-checked") === "true");
    const next = pills[(current + step + pills.length) % pills.length]!;
    next.focus();
    next.click();
  });

  // --- Step 1: pin ---
  const checkPinned = async () => {
    try {
      const settings = await chrome.action.getUserSettings();
      if (settings.isOnToolbar && !state.pinned) {
        state.pinned = true;
        render();
      }
    } catch {
      // Older Chrome without getUserSettings: leave the step as instructions.
    }
  };
  void checkPinned();
  const onSettingsChanged = (chrome.action as { onUserSettingsChanged?: chrome.events.Event<() => void> }).onUserSettingsChanged;
  onSettingsChanged?.addListener(() => void checkPinned());
  setInterval(() => {
    if (!state.pinned && document.visibilityState === "visible") void checkPinned();
  }, 1500);

  // --- Step 3: first save ---
  const { imagesSavedCount: startCount } = await getStats();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.defaultFolder) {
      folder = String(changes.defaultFolder.newValue ?? folder);
    }
    if (area !== "local" || !changes.imagesSavedCount) return;
    if (Number(changes.imagesSavedCount.newValue) > startCount && !state.saved) {
      state.saved = true;
      // Any save counts, so the earlier steps are done too.
      state.pinned = true;
      state.formatChosen = true;
      render();
      celebrate();
    }
  });

  render();
}

function celebrate(): void {
  void getPreferences().then((prefs) => {
    document.getElementById("savedFolder")!.textContent = prefs.saveMode === "quick" ? ` / ${prefs.defaultFolder}` : "";
  });
  document.getElementById("sticker")!.hidden = true;
  document.getElementById("celebrate")!.hidden = false;
  document.getElementById("closeTabBtn")!.focus();
}

document.getElementById("closeTabBtn")?.addEventListener("click", () => {
  window.close();
});

void init();
