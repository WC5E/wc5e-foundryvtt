import { normaliseName } from "./manifest.mjs";
import { TARGETS, DESTINATIONS, listsAvailable } from "./plan.mjs";

export const MODULE_ID = "wc5e-foundryvtt";

const liveDeps = () => ({
	getPack: (id) => game.packs.get(id),
	getWorldActors: () => game.actors.contents,
	resolveUuid: (uuid) => fromUuid(uuid),
});

/**
 * The embedded item payload for a spell found in the GM's own compendium.
 * Mirrors what spell_embed._embed_item() does at build time.
 */
export function spellItemData(sourceDoc, { prep, perDay }) {
	const data = sourceDoc.toObject();
	delete data._id;
	data.system = data.system ?? {};
	// dnd5e 5.1 replaced `system.preparation` with `system.method` +
	// `system.prepared`. A compatibility shim still migrates the old shape, but
	// only when the new fields are ABSENT -- and toObject() on a 5.x spell always
	// emits them, because `method`/`prepared` are `required` with an `initial`,
	// so SchemaField cleaning fills them in. Writing `preparation` here would
	// therefore be silently discarded and every assigned spell would arrive as
	// method:"" -- at-will and innate spells missing from their sheet sections,
	// prepared ones showing unprepared. Mapping mirrors SpellData.#migratePreparation.
	delete data.system.preparation;
	data.system.method = prep === "prepared" ? "spell" : prep;
	data.system.prepared = prep === "prepared" ? 1 : 0;
	if (prep === "innate" && perDay) {
		data.system.uses = { max: String(perDay), spent: 0, recovery: [{ period: "day", type: "recoverAll" }] };
	}
	return data;
}

function sourceIdOf(actor) {
	return actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? null;
}

/**
 * Gather what already exists, so the planner can be additive.
 * @returns {Promise<{monsters: object[], lists: object[]}>}
 */
export async function collectState({ manifest, targets, destination, deps = liveDeps() }) {
	const monsters = [];
	const lists = [];

	if (targets.includes(TARGETS.MONSTERS)) {
		const wantPack = destination !== DESTINATIONS.WORLD;
		const wantWorld = destination !== DESTINATIONS.COMPENDIUM;

		if (wantPack) {
			const pack = deps.getPack(`${MODULE_ID}.monsters`);
			const docs = pack ? await pack.getDocuments() : [];
			for (const actor of docs) {
				if (!manifest.monsters[actor.id]) {
					continue;
				}
				monsters.push({
					id: actor.id,
					name: actor.name ?? manifest.monsters[actor.id].name,
					scope: "pack",
					uuid: actor.uuid,
					haveKeys: spellKeys(actor, manifest.aliases),
				});
			}
		}

		if (wantWorld) {
			const prefix = `Compendium.${MODULE_ID}.monsters.Actor.`;
			for (const actor of deps.getWorldActors()) {
				const src = sourceIdOf(actor);
				if (!src?.startsWith(prefix)) {
					continue;
				}
				const id = src.slice(prefix.length);
				if (!manifest.monsters[id]) {
					continue;
				}
				monsters.push({
					id,
					name: actor.name ?? manifest.monsters[id].name,
					scope: "world",
					uuid: actor.uuid,
					haveKeys: spellKeys(actor, manifest.aliases),
				});
			}
		}
	}

	if (targets.includes(TARGETS.LISTS) && listsAvailable(destination)) {
		const pack = deps.getPack(`${MODULE_ID}.spell-lists`);
		const journals = pack ? await pack.getDocuments() : [];
		const pages = [];
		for (const journal of journals) {
			for (const page of journal.pages ?? []) {
				const key = `${journal.id}.${page.id}`;
				if (!manifest.spellLists[key]) {
					continue;
				}
				pages.push({ key, page, uuids: [...(page.system?.spells ?? [])] });
			}
		}
		// What each page already points at, by normalised name. Resolved from pack
		// indexes rather than by loading every linked document: a class list can
		// carry 150+ entries and this runs on every scan.
		const names = await resolveUuidNames(
			pages.flatMap((p) => p.uuids),
			deps,
		);
		for (const { key, page, uuids } of pages) {
			lists.push({
				pageKey: key,
				name: page.name,
				uuid: page.uuid,
				haveUuids: new Set(uuids),
				haveKeys: new Set(
					uuids
						.map((u) => names.get(u))
						.filter(Boolean)
						.map((n) => normaliseName(n, manifest.aliases)),
				),
			});
		}
	}

	return { monsters, lists };
}

/**
 * uuid -> document name, for compendium uuids, read from pack indexes.
 *
 * One getIndex() per distinct pack rather than one fromUuid() per entry: a
 * class spell list can hold 150+ links and this runs on every scan. A uuid
 * whose pack is unavailable is simply absent from the result, so the caller
 * treats that entry as unknown rather than as satisfied. That is the safe way
 * round for monsters, where applyPlan would skip the duplicate anyway. For
 * lists it can mean re-linking the same spell under a second uuid, since
 * applyPlan dedupes list entries by uuid -- only reachable when a pack the
 * list already points into has gone missing.
 *
 * @param {string[]} uuids
 * @returns {Promise<Map<string, string>>}
 */
async function resolveUuidNames(uuids, deps) {
	const byPack = new Map();
	for (const uuid of new Set(uuids)) {
		const m = /^Compendium\.([^.]+\.[^.]+)\.\w+\.(\w+)$/.exec(uuid);
		if (!m) {
			continue;
		}
		if (!byPack.has(m[1])) {
			byPack.set(m[1], []);
		}
		byPack.get(m[1]).push([m[2], uuid]);
	}
	const out = new Map();
	for (const [packId, entries] of byPack) {
		const pack = deps.getPack(packId);
		if (!pack) {
			continue;
		}
		let index;
		try {
			index = await pack.getIndex();
		} catch {
			continue;
		}
		for (const [id, uuid] of entries) {
			const name = index.get(id)?.name;
			if (name) {
				out.set(uuid, name);
			}
		}
	}
	return out;
}

function spellKeys(actor, aliases) {
	const keys = new Set();
	for (const item of actor.items ?? []) {
		if (item.type === "spell") {
			keys.add(normaliseName(item.name, aliases));
		}
	}
	return keys;
}

/**
 * Execute a plan. Additive only: every write is a create or an append.
 * @returns {Promise<{added: number, entriesAdded: number, failures: object[]}>}
 */
export async function applyPlan(plan, { deps = liveDeps(), onProgress = null } = {}) {
	const failures = [];
	let added = 0;
	let entriesAdded = 0;
	const unlocked = new Map();

	// Unlock everything up front. If a pack refuses, abort before writing
	// anything -- otherwise every write to it fails identically and the report
	// becomes dozens of rows of the same error.
	const packIds = new Set();
	for (const write of plan.writes) {
		const m = /^Compendium\.([^.]+\.[^.]+)\./.exec(write.uuid);
		if (m) {
			packIds.add(m[1]);
		}
	}
	for (const packId of packIds) {
		const pack = deps.getPack(packId);
		if (!pack || !pack.locked) {
			continue;
		}
		try {
			await pack.configure({ locked: false });
			unlocked.set(packId, pack);
		} catch (err) {
			for (const p of unlocked.values()) {
				await p.configure({ locked: true }).catch(() => {});
			}
			// eslint-disable-next-line preserve-caught-error -- surfaced to the GM as a notification, not inspected
			throw new Error(`Could not unlock ${packId}: ${err.message ?? err}`);
		}
	}

	try {
		let done = 0;
		for (const write of plan.writes) {
			try {
				const target = await deps.resolveUuid(write.uuid);
				if (!target) {
					throw new Error("target document not found");
				}

				if (write.kind === "monster") {
					const data = [];
					for (const s of write.spells) {
						const src = await deps.resolveUuid(s.match.uuid);
						if (!src) {
							throw new Error(`spell not found: ${s.name}`);
						}
						data.push(spellItemData(src, s));
					}
					await target.createEmbeddedDocuments("Item", data);
					added += data.length;
				} else {
					const have = new Set(target.system?.spells ?? []);
					for (const s of write.spells) {
						have.add(s.match.uuid);
					}
					await target.update({ "system.spells": [...have] });
					entriesAdded += write.spells.length;
				}
			} catch (err) {
				failures.push({ target: write.targetName, error: err.message ?? String(err) });
			} finally {
				onProgress?.(++done, plan.writes.length, write.targetName);
			}
		}
	} finally {
		// Re-lock whatever we unlocked, even if the run threw. Leaving a module
		// pack unlocked invites accidental edits that a module update then wipes.
		for (const [packId, pack] of unlocked.entries()) {
			try {
				await pack.configure({ locked: true });
			} catch (err) {
				const message = `could not re-lock: ${err.message ?? err}`;
				failures.push({ target: packId, error: message });
				console.warn(`wc5e-foundryvtt | ${packId}: ${message}`);
			}
		}
	}

	return { added, entriesAdded, failures };
}
