export interface MonsterFeature {
	name?: string | null;
	text: string;
}

export interface MonsterSourceRoot {
	monster: MonsterSourceRecord[];
}

export interface MonsterSourceRecord {
	name: string;
	source?: string;
	page?: number;
	size: string[];
	type: string | MonsterSourceType;
	alignment: string[];
	ac: Array<number | MonsterSourceAc>;
	hp: MonsterSourceHp;
	speed: MonsterSourceSpeed;
	str: number;
	dex: number;
	con: number;
	int: number;
	wis: number;
	cha: number;
	save?: Record<string, string>;
	skill?: Record<string, string>;
	senses?: string[];
	passive?: number;
	vulnerable?: MonsterSourceDefense[];
	resist?: MonsterSourceDefense[];
	immune?: MonsterSourceDefense[];
	conditionImmune?: string[];
	languages?: string[];
	cr: string | MonsterSourceCr;
	spellcasting?: MonsterSourceSpellcasting[];
	trait?: MonsterSourceEntry[];
	action?: MonsterSourceEntry[];
	reaction?: MonsterSourceEntry[];
	legendary?: MonsterSourceEntry[];
	variant?: MonsterSourceEntry[];
}

export interface MonsterSourceType {
	type?: string;
	tags?: string[];
}

export interface MonsterSourceAc {
	ac: number;
	from?: string[];
	condition?: string;
}

export interface MonsterSourceHp {
	average?: number;
	formula?: string;
}

export interface MonsterSourceSpeed {
	walk?: number | MonsterSourceMovement;
	fly?: number | MonsterSourceMovement;
	swim?: number | MonsterSourceMovement;
	climb?: number | MonsterSourceMovement;
	burrow?: number | MonsterSourceMovement;
	canHover?: boolean;
}

export interface MonsterSourceMovement {
	number: number;
	condition?: string;
}

export type MonsterSourceDefense = string | MonsterSourceConditionalDefense;

export interface MonsterSourceConditionalDefense {
	vulnerable?: string[];
	resist?: string[];
	immune?: string[];
	note?: string;
	cond?: boolean;
}

export interface MonsterSourceCr {
	cr?: string;
	xp?: number;
}

export interface MonsterSourceEntry {
	name?: string;
	entries?: MonsterSourceEntryContent[];
	type?: string;
	items?: MonsterSourceEntryContent[];
}

export type MonsterSourceEntryContent = string | MonsterSourceEntry;

export interface MonsterSourceSpellcasting {
	name: string;
	type?: string;
	headerEntries?: MonsterSourceEntryContent[];
	footerEntries?: MonsterSourceEntryContent[];
	will?: string[];
	daily?: Record<string, string[]>;
	spells?: Record<string, MonsterSourceSpellLevel>;
	ability?: string;
}

export interface MonsterSourceSpellLevel {
	slots?: number;
	spells?: string[];
}

export interface ParsedMonster {
	name: string;
	size: string;
	type: string;
	subtype: string;
	alignment: string;
	ac: number;
	hp: number;
	hp_formula: string;
	speed: Record<string, number | boolean>;
	senses: Record<string, number | string>;
	cr: number | null;
	abilities: Record<string, number>;
	saves?: Record<string, number>;
	skills?: Record<string, number>;
	damage_vulnerabilities?: string;
	damage_resistances?: string;
	damage_immunities?: string;
	condition_immunities?: string;
	languages: string;
	traits: MonsterFeature[];
	actions: MonsterFeature[];
	reactions: MonsterFeature[];
	legendary: MonsterFeature[];
	_wip?: boolean;
}