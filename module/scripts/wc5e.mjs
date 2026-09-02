import { AutoAssignApp, SETTINGS, registerTemplates, registerHelpers } from "./auto-assign/app.mjs";
import { loadManifest, manifestTotals } from "./auto-assign/manifest.mjs";
import { DESTINATIONS } from "./auto-assign/plan.mjs";

const MODULE_ID = "wc5e-foundryvtt";

Hooks.once("init", () => {
  registerHelpers();

  game.settings.registerMenu(MODULE_ID, "autoAssignMenu", {
    name: "WC5E.AutoAssign.MenuName",
    label: "WC5E.AutoAssign.MenuLabel",
    hint: "WC5E.AutoAssign.MenuHint",
    icon: "fa-solid fa-wand-magic-sparkles",
    type: AutoAssignApp,     // registerMenu accepts any ApplicationV2 subclass;
    restricted: true,        // AutoAssignApp loads itself in _prepareContext
  });

  game.settings.register(MODULE_ID, SETTINGS.packs, {
    scope: "world", config: false, type: Array, default: [],
  });
  game.settings.register(MODULE_ID, SETTINGS.targets, {
    scope: "world", config: false, type: Object,
    default: { monsters: true, spellLists: true },
  });
  game.settings.register(MODULE_ID, SETTINGS.destination, {
    scope: "world", config: false, type: String, default: DESTINATIONS.BOTH,
  });
  game.settings.register(MODULE_ID, SETTINGS.dismissed, {
    scope: "world", config: false, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.promptedVersion, {
    scope: "world", config: false, type: String, default: "",
  });
});

Hooks.once("ready", async () => {
  await registerTemplates();
  if ( !game.user.isGM ) {
 return; 
}
  if ( game.settings.get(MODULE_ID, SETTINGS.dismissed) ) {
 return; 
}

  const version = game.modules.get(MODULE_ID)?.version ?? "";
  if ( game.settings.get(MODULE_ID, SETTINGS.promptedVersion) === version ) {
 return; 
}

  let totals;
  try {
    totals = manifestTotals(await loadManifest());
  } catch ( err ) {
    console.warn("wc5e-foundryvtt | could not read the auto-assign manifest", err);
    return;
  }
  if ( !totals.monsterSpells && !totals.listSpells ) {
 return; 
}

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("WC5E.AutoAssign.PromptTitle") },
    content: `<p>${game.i18n.format("WC5E.AutoAssign.PromptBody", totals)}</p>`
      + `<p class="notes">${game.i18n.localize("WC5E.AutoAssign.UpdateCaveat")}</p>`,
    buttons: [
      { action: "run", icon: "fa-solid fa-wand-magic-sparkles",
        label: game.i18n.localize("WC5E.AutoAssign.PromptRun"), default: true },
      { action: "later", label: game.i18n.localize("WC5E.AutoAssign.PromptLater") },
      { action: "never", label: game.i18n.localize("WC5E.AutoAssign.PromptNever") },
    ],
    rejectClose: false,
  });

  if ( choice === "never" ) {
 await game.settings.set(MODULE_ID, SETTINGS.dismissed, true); 
}
  await game.settings.set(MODULE_ID, SETTINGS.promptedVersion, version);
  if ( choice === "run" ) {
 AutoAssignApp.show(); 
}
});
