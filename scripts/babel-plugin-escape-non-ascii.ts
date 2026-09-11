const hasNonAscii = (text: string): boolean => {
	for (let i = 0; i < text.length; i += 1) {
		if (text.charCodeAt(i) > 0x7f) {
			return true;
		}
	}
	return false;
};

const escapeNonAscii = (text: string): string => {
	let escaped = '';
	for (let i = 0; i < text.length; i += 1) {
		const code = text.charCodeAt(i);
		escaped +=
			code > 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : text[i];
	}
	return escaped;
};

/**
 * Apps Script destroys surrogate-pair (non-BMP) characters such as emoji when it
 * stores script source, so all literal text is emitted as pure-ASCII escapes.
 */
const escapeNonAsciiLiterals = () => ({
	name: 'escape-non-ascii-literals',
	visitor: {
		StringLiteral(path: any) {
			if (!hasNonAscii(path.node.value)) {
				return;
			}

			path.node.extra = {
				...path.node.extra,
				raw: escapeNonAscii(JSON.stringify(path.node.value)),
				rawValue: path.node.value,
			};
		},
		TemplateElement(path: any) {
			if (!hasNonAscii(path.node.value.raw)) {
				return;
			}

			path.node.value.raw = escapeNonAscii(path.node.value.raw);
		},
	},
});

export default escapeNonAsciiLiterals;
