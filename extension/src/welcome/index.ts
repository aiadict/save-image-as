import { setPreferences } from "../lib/storage";

void setPreferences({ hasCompletedOnboarding: true });

document.getElementById("closeTabBtn")?.addEventListener("click", () => {
  window.close();
});
