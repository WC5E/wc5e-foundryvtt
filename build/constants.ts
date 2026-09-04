export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export const ABILITY_NAME: Record<string, string> = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha",
};

export const SKILL_KEYS: Record<string, string> = {
	acrobatics: "acr",
	animalhandling: "ani",
	arcana: "arc",
	athletics: "ath",
	deception: "dec",
	history: "his",
	insight: "ins",
	intimidation: "itm",
	investigation: "inv",
	medicine: "med",
	nature: "nat",
	perception: "prc",
	performance: "prf",
	persuasion: "per",
	religion: "rel",
	sleightofhand: "slt",
	stealth: "ste",
	survival: "sur",
};

export const SKILL_ABILITY: Record<string, string> = {
	acr: "dex",
	ani: "wis",
	arc: "int",
	ath: "str",
	dec: "cha",
	his: "int",
	ins: "wis",
	itm: "cha",
	inv: "int",
	med: "wis",
	nat: "int",
	prc: "wis",
	prf: "cha",
	per: "cha",
	rel: "int",
	slt: "dex",
	ste: "dex",
	sur: "wis",
};

export const SIZE_CODES: Record<string, string> = {
	T: "tiny",
	S: "small",
	M: "medium",
	L: "large",
	H: "huge",
	G: "gargantuan",
};

export const SIZE_MAP: Record<string, string> = {
	tiny: "tiny",
	small: "sm",
	medium: "med",
	large: "lg",
	huge: "huge",
	gargantuan: "grg",
};

export const TOKEN_SIZE: Record<string, number> = {
	tiny: 1,
	sm: 1,
	med: 1,
	lg: 2,
	huge: 3,
	grg: 4,
};

export const ALIGNMENT_CODES: Record<string, string> = {
	L: "lawful",
	N: "neutral",
	C: "chaotic",
	G: "good",
	E: "evil",
	U: "unaligned",
	A: "any alignment",
};

export const TYPE_FOLDER: Record<string, [string, string]> = {
	aberration: ["Aberrations", "#6b3fa0"],
	beast: ["Beasts", "#6b8e23"],
	celestial: ["Celestials", "#d4af37"],
	construct: ["Constructs", "#8a8a8a"],
	dragon: ["Dragons", "#b22222"],
	elemental: ["Elementals", "#1e90ff"],
	fey: ["Fey", "#c71585"],
	fiend: ["Fiends", "#8b0000"],
	giant: ["Giants", "#8b5a2b"],
	humanoid: ["Humanoids", "#4682b4"],
	monstrosity: ["Monstrosities", "#556b2f"],
	ooze: ["Oozes", "#6b8e23"],
	plant: ["Plants", "#2e8b57"],
	undead: ["Undead", "#4b0082"],
};

export const CREATURE_TYPES = new Set(Object.keys(TYPE_FOLDER));

export const DAMAGE_TYPES = [
	"acid",
	"bludgeoning",
	"cold",
	"fire",
	"force",
	"lightning",
	"necrotic",
	"piercing",
	"poison",
	"psychic",
	"radiant",
	"slashing",
	"thunder",
] as const;

export const CONDITION_STEMS: Record<string, string> = {
	blind: "blinded",
	charm: "charmed",
	deaf: "deafened",
	exhaust: "exhaustion",
	fright: "frightened",
	grappl: "grappled",
	incapacit: "incapacitated",
	invisib: "invisible",
	paraly: "paralyzed",
	petrif: "petrified",
	pretrif: "petrified",
	poison: "poisoned",
	prone: "prone",
	restrain: "restrained",
	stun: "stunned",
	unconsci: "unconscious",
	diseas: "diseased",
};
