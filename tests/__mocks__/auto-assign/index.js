const fakePack = (id, label, entries, { documentName = "Item", throws = null } = {}) => ({
	collection: id,
	metadata: { label },
	documentName,
	async getIndex() {
		if (throws) {
			throw new Error(throws);
		}
		return entries.map((entry) => ({
			_id: entry.id,
			name: entry.name,
			type: entry.type ?? "spell",
			uuid: `Compendium.${id}.Item.${entry.id}`,
		}));
	},
});

export const packs = {
	"a.spells": fakePack("a.spells", "A Spells", [
		{ id: "1", name: "Ice Knife" },
		{ id: "2", name: "Shape Water" },
		{ id: "3", name: "A Sword", type: "weapon" },
	]),
	"b.spells": fakePack("b.spells", "B Spells", [
		{ id: "9", name: "Ice Knife" },
		{ id: "8", name: "Hex" },
	]),
	"c.actors": fakePack("c.actors", "C Actors", [{ id: "7", name: "Ghoul" }], { documentName: "Actor" }),
	"d.broken": fakePack("d.broken", "D Broken", [], { throws: "index unavailable" }),
};

export const getPack = (id) => packs[id];