import { displayName, HEADER } from "./parse.js";

// Renders a Spellcasting feature's plain text (built by source/render.ts renderSpellcasting)
// as one <p class="feature"> summary followed by one <p class="feature-trait"> per spell group,
// matching the structure dnd5e monster stat blocks use (bold group label, italic spell names).
export const renderSpellcastingHtml = (text: string): string => {
	const paragraphs = text
		.split("\n")
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	if (!paragraphs.length) {
		return "";
	}

	const [summary, ...groups] = paragraphs;
	const html = [`<p class="feature">${summary}</p>`];

	for (const paragraph of groups) {
		HEADER.lastIndex = 0;
		const match = HEADER.exec(paragraph);
		if (!match || match.index !== 0) {
			html.push(`<p>${paragraph}</p>`);
			continue;
		}

		const label = match[0];
		const body = paragraph.slice(label.length).replace(/^[ :]+/, "");
		const spells = body
			.split(/[,;]/)
			.map((name) => displayName(name))
			.filter(Boolean)
			.map((name) => `<em>${name}</em>`)
			.join(", ");
		html.push(`<p class="feature-trait"><strong>${label}:</strong> ${spells}</p>`);
	}

	return html.join("\n");
};
