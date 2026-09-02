export interface MonsterFeature {
	name?: string | null;
	text: string;
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
	senses: Record<string, number>;
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