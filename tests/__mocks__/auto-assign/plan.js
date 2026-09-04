import { TARGETS } from "../../../module/scripts/auto-assign/plan.mjs";

export const MANIFEST = {
	aliases: {},
	monsters: {
		m1: {
			name: "Frost Revenant",
			pack: "monsters",
			spells: [
				{ name: "Ice Knife", key: "ice knife", prep: "prepared", level: 1, perDay: null },
				{ name: "Shape Water", key: "shape water", prep: "atwill", level: 0, perDay: null },
			],
		},
		m2: { name: "Fel Imp", pack: "monsters", spells: [{ name: "Hex", key: "hex", prep: "innate", level: 1, perDay: 2 }] },
	},
	spellLists: {
		"j.p1": {
			name: "Mage Spells",
			identifier: "wc5e-mage",
			pack: "spell-lists",
			spells: [
				{ name: "Synaptic Static", key: "synaptic static", source: "XGE" },
				{ name: "Ice Knife", key: "ice knife", source: "XGE" },
			],
		},
	},
};

export const MATCHES = {
	"ice knife": { uuid: "Compendium.x.Item.1", name: "Ice Knife", packId: "x", packLabel: "X" },
	hex: { uuid: "Compendium.x.Item.2", name: "Hex", packId: "x", packLabel: "X" },
};

export const index = { get: (key) => MATCHES[key], size: 2, failed: [] };
export const ALL = [TARGETS.MONSTERS, TARGETS.LISTS];