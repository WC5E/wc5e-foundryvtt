import { SKILL_ABILITY, abilityMod } from "../mappings.js";
import type { ParsedMonster } from "../types.js";

export function buildAbilities(monster: ParsedMonster, proficiencyBonus: number) {
	const output: Record<string, any> = {};
	const saves = monster.saves ?? {};
	for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
		const score = monster.abilities[key] ?? 10;
		const entry = { value: score, proficient: 0, max: null, bonuses: { check: "", save: "" } };
		if (Object.prototype.hasOwnProperty.call(saves, key)) {
			entry.proficient = 1;
			const delta = saves[key] - (abilityMod(score) + proficiencyBonus);
			if (delta !== 0) {
 entry.bonuses.save = String(delta); 
}
		}
		output[key] = entry;
	}
	return output;
}

export function buildSkills(monster: ParsedMonster, proficiencyBonus: number) {
	const output: Record<string, any> = {};
	const listed = monster.skills ?? {};
	for (const [key, ability] of Object.entries(SKILL_ABILITY)) {
		const entry = { value: 0, ability, bonuses: { check: "", passive: "" } };
		if (Object.prototype.hasOwnProperty.call(listed, key)) {
			const score = monster.abilities[ability] ?? 10;
			const mod = abilityMod(score);
			const listedTotal = listed[key];
			if (listedTotal === mod + 2 * proficiencyBonus) {
				entry.value = 2;
			} else {
				entry.value = 1;
				const delta = listedTotal - (mod + proficiencyBonus);
				if (delta !== 0) {
 entry.bonuses.check = String(delta); 
}
			}
		}
		output[key] = entry;
	}
	return output;
}