import { createHash } from "node:crypto";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function base62FromSha1(input: string): string {
	let value = BigInt(`0x${createHash("sha1").update(input).digest("hex")}`);
	let output = "";
	for (let index = 0; index < 16; index += 1) {
		const digit = Number(value % 62n);
		output += BASE62[digit];
		value /= 62n;
	}
	return output;
}

export function makeId(...parts: unknown[]): string {
	return base62FromSha1(parts.map(String).join("::"));
}

export function folderId(folderType: string, name: string): string {
	return base62FromSha1(`folder::${folderType}::${name}`);
}

export function folderDoc(folderType: string, name: string, color = "", sort = 0) {
	const id = folderId(folderType, name);
	return {
		name,
		type: folderType,
		_id: id,
		folder: null,
		sorting: "a",
		sort,
		color,
		flags: {},
		_stats: { systemId: "dnd5e", systemVersion: "5.3.3" },
		_key: `!folders!${id}`,
	};
}