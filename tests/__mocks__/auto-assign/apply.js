export const SOURCE = {
	toObject: () => ({
		_id: "src1",
		name: "Hex",
		type: "spell",
		system: { level: 1, preparation: { mode: "prepared", prepared: false } },
	}),
};

export const MONSTER_WRITE = {
	kind: "monster",
	uuid: "Compendium.wc5e-foundryvtt.monsters.Actor.m1",
	targetName: "Fel Imp",
	scope: "pack",
	spells: [{ name: "Hex", key: "hex", prep: "innate", perDay: 2, match: { uuid: "Compendium.x.Item.2" } }],
};