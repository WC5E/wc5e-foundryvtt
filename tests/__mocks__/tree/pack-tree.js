export const FIXTURE = {
	folders: [
		{ id: "f1", name: "DBB Core Source", parentId: null },
		{ id: "f2", name: "DBB Extra Source", parentId: null },
		{ id: "f3", name: "Nested", parentId: "f1" },
		{ id: "f4", name: "Empty", parentId: null },
	],
	packs: [
		{ id: "p.core.spells", name: "DBB Core Source Spells", folderId: "f1" },
		{ id: "p.core.items", name: "DBB Core Source Items", folderId: "f1" },
		{ id: "p.nested", name: "Nested Spells", folderId: "f3" },
		{ id: "p.extra.spells", name: "DBB Extra Source Spells", folderId: "f2" },
		{ id: "p.loose", name: "Loose Pack", folderId: null },
	],
};